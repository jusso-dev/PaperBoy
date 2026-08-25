export type TemplatePreviewState = {
  error: string | null;
  html: string | null;
  missingVariables: string[];
  subject: string;
  text: string | null;
};
