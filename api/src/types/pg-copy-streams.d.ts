declare module "pg-copy-streams" {
  import type { Readable, Writable } from "node:stream";
  export function from(txt: string): Writable;
  export function to(txt: string): Readable;
}
