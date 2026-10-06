declare module 'translate-google' {
  interface TranslateResult {
    text: string;
    from?: {
      language?: {
        iso: string;
      };
    };
  }

  interface TranslateOptions {
    from?: string;
    to?: string;
    detail?: boolean;
  }

  function translate(
    text: string,
    options?: TranslateOptions,
  ): Promise<TranslateResult>;

  export default translate;
}
