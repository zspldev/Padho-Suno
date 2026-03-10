import { db } from "./db";
import { scans } from "../shared/schema";
import { desc, eq } from "drizzle-orm";
import type { Scan } from "../shared/schema";

export function createScan(data: {
  imageFilename?: string;
  extractedText: string;
  detectedLanguage: string;
}): Scan {
  const result = db
    .insert(scans)
    .values({
      imageFilename: data.imageFilename ?? null,
      extractedText: data.extractedText,
      detectedLanguage: data.detectedLanguage,
      createdAt: Math.floor(Date.now() / 1000),
    })
    .returning()
    .get();
  return result;
}

export function getAllScans(): Scan[] {
  return db.select().from(scans).orderBy(desc(scans.createdAt)).all();
}

export function getScanById(id: number): Scan | undefined {
  return db.select().from(scans).where(eq(scans.id, id)).get();
}

export function deleteScan(id: number): void {
  db.delete(scans).where(eq(scans.id, id)).run();
}
