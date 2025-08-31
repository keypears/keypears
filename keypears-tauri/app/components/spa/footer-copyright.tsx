export function FooterCopyright() {
  return (
    <div className="mx-auto mb-4">
      <div className="text-center text-black/70 text-sm dark:text-white/70">
        Copyright &copy; {new Date().getFullYear()} EarthBucks Inc.
      </div>
    </div>
  );
}
