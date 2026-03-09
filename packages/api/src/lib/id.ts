import { ulidFactory } from "ulid-workers";

const ulid = ulidFactory();

export function generateId(): string {
  return ulid();
}
