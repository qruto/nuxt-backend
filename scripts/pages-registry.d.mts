export interface PageFile {
  file: string
  name: string
  key: string
  doc: string
}

/** Every page file's key and doc comment, in file-name order. */
export declare function readPages(): PageFile[]

/** The text of src/pages/registry.ts. */
export declare function registryText(pages?: PageFile[]): string
