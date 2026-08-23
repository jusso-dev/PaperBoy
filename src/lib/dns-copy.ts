export type ClipboardTextWriter = (value: string) => Promise<void>;

export async function copyExactDnsTxtValue(
  record: { value: string | null },
  writeText: ClipboardTextWriter,
): Promise<void> {
  if (record.value === null) {
    throw new Error("DNS record has no TXT value to copy.");
  }
  await writeText(record.value);
}
