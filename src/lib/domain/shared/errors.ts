import { Prisma } from "@prisma/client";

/** Thrown when a create/update would violate a tenant-scoped uniqueness rule (code, SKU, ...). */
export class DuplicateValueError extends Error {
  constructor(
    public readonly field: string,
    message: string
  ) {
    super(message);
    this.name = "DuplicateValueError";
  }
}

export function isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
