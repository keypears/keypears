import {
  insert_nonce_217a,
  get_work_par_217a,
  elementary_iteration_217a,
} from "./rs-keypears_pow5-inline-base64/keypears_pow5.js";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";

export function insertNonce(
  header: FixedBuf<217>,
  nonce: number,
): FixedBuf<217> {
  const res = WebBuf.fromUint8Array(insert_nonce_217a(header.buf, nonce));
  return FixedBuf.fromBuf(217, res);
}

export function getWorkPar(header: FixedBuf<217>): FixedBuf<32> {
  return FixedBuf.fromBuf(32, WebBuf.fromUint8Array(get_work_par_217a(header.buf)));
}

export function elementaryIteration(header: FixedBuf<217>): FixedBuf<32> {
  return FixedBuf.fromBuf(
    32,
    WebBuf.fromUint8Array(elementary_iteration_217a(header.buf)),
  );
}
