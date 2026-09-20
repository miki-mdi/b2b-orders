"use server";

import { revalidatePath } from "next/cache";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { confirmImport, previewImport } from "@/lib/domain/import/import-service";
import { assertFileSize } from "@/lib/domain/import/security";
import { IMPORT_TYPES, type ImportType, type ImportConfirmResult, type ImportPreviewResult } from "@/lib/domain/import/types";

function isImportType(value: string): value is ImportType {
  return (IMPORT_TYPES as readonly string[]).includes(value);
}

export type ImportActionResult =
  | { status: "error"; message: string }
  | { status: "preview"; preview: ImportPreviewResult }
  | { status: "confirmed"; result: ImportConfirmResult };

function readFile(formData: FormData): File | null {
  const file = formData.get("file");
  return file instanceof File && file.size > 0 ? file : null;
}

/**
 * Step 2 of the wizard (§2): parses and validates the uploaded file WITHOUT
 * writing anything - see import-service.ts's previewImport. The client
 * component keeps the same File in state and re-submits it unchanged to
 * confirmImportAction below, so the server never trusts a client-echoed
 * plan (requirement #2's "never write data during preview").
 */
export async function previewImportAction(importType: string, formData: FormData): Promise<ImportActionResult> {
  const session = await requireSellerSession();
  if (!isImportType(importType)) {
    return { status: "error", message: "Unknown import type." };
  }
  const file = readFile(formData);
  if (!file) {
    return { status: "error", message: "Please choose a CSV file." };
  }

  try {
    assertFileSize(file.size);
    const text = await file.text();
    const preview = await previewImport(importType, session.tenantId, session.userId, text);
    return { status: "preview", preview };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }
}

/** Step 5: the only action that writes - see import-service.ts's confirmImport for the atomicity/audit guarantees. */
export async function confirmImportAction(importType: string, formData: FormData): Promise<ImportActionResult> {
  const session = await requireSellerSession();
  if (!isImportType(importType)) {
    return { status: "error", message: "Unknown import type." };
  }
  const file = readFile(formData);
  if (!file) {
    return { status: "error", message: "Please choose a CSV file." };
  }

  try {
    assertFileSize(file.size);
    const text = await file.text();
    const result = await confirmImport(importType, session.tenantId, session.userId, text, file.name);
    revalidatePath("/", "layout");
    return { status: "confirmed", result };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }
}
