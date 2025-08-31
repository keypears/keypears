import { $aicon } from "~app/util/aicons.js";

export function Logo() {
  return (
    <div className="mx-auto block aspect-square w-[120px]">
      <img
        src={$aicon("/images/earthbucks-300.webp")}
        alt=""
        className="block"
      />
    </div>
  );
}
