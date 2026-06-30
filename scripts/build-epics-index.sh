#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
EPICS_DIR="${EPICS_DIR:-$REPO_DIR/epics}"
OUTPUT="${EPICS_INDEX_OUTPUT:-$EPICS_DIR/README.md}"

die() {
  echo "error: $*" >&2
  exit 1
}

extract_frontmatter() {
  local readme="$1"
  awk '
    NR == 1 && $0 != "+++" { exit 2 }
    NR == 1 { next }
    $0 == "+++" { found = 1; exit }
    { print }
    END { if (!found) exit 3 }
  ' "$readme"
}

frontmatter_value() {
  local frontmatter="$1"
  local key="$2"
  local matches
  local value

  matches="$(printf '%s\n' "$frontmatter" | grep -E "^${key}[[:space:]]*=" || true)"
  [ "$(printf '%s\n' "$matches" | sed '/^$/d' | wc -l | tr -d ' ')" -le 1 ] ||
    die "duplicate ${key} key"

  [ -n "$matches" ] || return 0
  value="$(printf '%s\n' "$matches" |
    sed -nE "s/^${key}[[:space:]]*=[[:space:]]*\"([^\"]+)\"[[:space:]]*$/\\1/p"
  )"
  [ -n "$value" ] || die "malformed ${key} key"
  printf '%s\n' "$value"
}

status_label() {
  case "$1" in
    open) echo "Open" ;;
    closed) echo "Closed" ;;
    template) echo "Template" ;;
    *) die "unknown status: $1" ;;
  esac
}

row_for_epic() {
  local readme="$1"
  local dir basename num frontmatter status opened closed title title_num title_text label

  dir="$(dirname "$readme")"
  basename="$(basename "$dir")"
  num="${basename%%-*}"

  [[ "$basename" =~ ^[0-9]{4}-.+ ]] ||
    die "$basename does not match epic folder shape"

  if ! frontmatter="$(extract_frontmatter "$readme")"; then
    die "$readme has malformed frontmatter delimiters"
  fi

  status="$(frontmatter_value "$frontmatter" status)"
  opened="$(frontmatter_value "$frontmatter" opened)"
  closed="$(frontmatter_value "$frontmatter" closed)"

  [ -n "$status" ] || die "$readme is missing status"
  [ -n "$opened" ] || die "$readme is missing opened"

  case "$status" in
    open | closed | template) ;;
    *) die "$readme has unknown status: $status" ;;
  esac

  if [ "$status" = "closed" ]; then
    [ -n "$closed" ] || die "$readme is closed but missing closed"
  else
    [ -z "$closed" ] || die "$readme has closed but status is $status"
  fi

  title="$(awk '/^[+][+][+]$/{n++; next} n>=2 && /^# /{sub(/^# /,""); print; exit}' "$readme")"
  [ -n "$title" ] || die "$readme is missing H1 title"

  if [[ "$title" =~ ^Epic[[:space:]]+([0-9]{4}):[[:space:]]+(.+)$ ]]; then
    title_num="${BASH_REMATCH[1]}"
    title_text="${BASH_REMATCH[2]}"
  else
    die "$readme H1 must match '# Epic NNNN: Title'"
  fi

  [ "$title_num" = "$num" ] ||
    die "$readme H1 number $title_num does not match folder number $num"

  label="$(status_label "$status")"
  printf '%s\t%s\t| [%s] | %s | %s |\t[%s]: %s/README.md\n' \
    "$status" "$num" "$num" "$title_text" "$label" "$num" "$basename"
}

replace_index() {
  local generated="$1"
  local prefix suffix

  [ -f "$OUTPUT" ] || die "$OUTPUT does not exist"
  grep -qx '## Index' "$OUTPUT" || die "$OUTPUT is missing ## Index"

  prefix="$(awk '/^## Index$/ { exit } { print }' "$OUTPUT")"
  suffix="$(awk '
    /^## Index$/ { seen_index = 1; in_index = 1; next }
    seen_index && in_index && /^## / { in_index = 0 }
    seen_index && !in_index { print }
  ' "$OUTPUT")"

  {
    printf '%s\n\n' "$prefix"
    printf '%s\n\n' "$generated"
    printf '%s\n' "$suffix"
  } > "$OUTPUT"
}

shopt -s nullglob

seen_nums=""
open_rows=""
closed_rows=""
template_rows=""

for readme in "$EPICS_DIR"/[0-9][0-9][0-9][0-9]-*/README.md; do
  basename="$(basename "$(dirname "$readme")")"
  num="${basename%%-*}"

  if printf '%s\n' "$seen_nums" | grep -qx "$num"; then
    die "duplicate epic number: $num"
  fi
  seen_nums+="${num}"$'\n'

  row="$(row_for_epic "$readme")"
  status="${row%%$'\t'*}"
  rest="${row#*$'\t'}"
  sort_num="${rest%%$'\t'*}"
  table_and_ref="${rest#*$'\t'}"

  case "$status" in
    open) open_rows+="${sort_num}"$'\t'"${table_and_ref}"$'\n' ;;
    closed) closed_rows+="${sort_num}"$'\t'"${table_and_ref}"$'\n' ;;
    template) template_rows+="${sort_num}"$'\t'"${table_and_ref}"$'\n' ;;
  esac
done

[ -n "$seen_nums" ] || die "no epic README files found in $EPICS_DIR"

sorted_rows="$(
  {
    printf '%s' "$open_rows" | sort -r -t$'\t' -k1,1 | cut -f2-
    printf '%s' "$closed_rows" | sort -r -t$'\t' -k1,1 | cut -f2-
    printf '%s' "$template_rows" | sort -r -t$'\t' -k1,1 | cut -f2-
  } | sed '/^$/d'
)"

table_rows="$(printf '%s\n' "$sorted_rows" | cut -f1 | sed '/^$/d')"
link_refs="$(printf '%s\n' "$sorted_rows" | cut -f2 | sed '/^$/d')"

generated="$(
  {
    echo "## Index"
    echo ""
    echo "| # | Title | Status |"
    echo "| - | ----- | ------ |"
    printf '%s\n' "$table_rows"
    echo ""
    printf '%s\n' "$link_refs"
  }
)"

replace_index "$generated"
prettier --write --prose-wrap always --print-width 80 "$OUTPUT" > /dev/null 2>&1

open_count="$(printf '%s' "$open_rows" | sed '/^$/d' | wc -l | tr -d ' ')"
closed_count="$(printf '%s' "$closed_rows" | sed '/^$/d' | wc -l | tr -d ' ')"
template_count="$(printf '%s' "$template_rows" | sed '/^$/d' | wc -l | tr -d ' ')"
echo "  ${OUTPUT#$REPO_DIR/}: ${open_count} open, ${closed_count} closed, ${template_count} template"
