export declare const slugOf: (name: string) => string

export interface TemplateDocument {
  name: string
  note: string
  words: unknown
  cut?: string
  seed?: number
  view: { x: number; y: number; zoom: number }
  photo: string | null
  saved: string
  updated: string
}

export declare function templateDocument(
  draft: { name: string; note?: string; kind: string; words: unknown; cut?: string; seed?: number; view?: { x: number; y: number; zoom: number }; photo?: string | null },
  key: string,
  saved: string,
  updated: string,
): TemplateDocument
export declare const templateText: (document: TemplateDocument) => string
