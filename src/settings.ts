import { DEFAULT_TIMESTAMP_FORMAT } from './utils/fileUtils';

/** Persisted plugin settings. */
export interface AdvancedHtmlExportSettings {
  imageQuality: 'high' | 'medium' | 'low';
  enableLazyLoading: boolean;
  enableImageDeduplication: boolean;
  exportCompression: 'none' | 'gzipb64' | 'gzipb85';
  timestampFormat: string;
  showExportStatistics: boolean;
  linkDepth: number;
  includeUnlinked: boolean;
  wikiTitle: string;
  enableThemeToggle: boolean;
  enableInlineTOC: boolean;
  defaultTheme: 'light' | 'dark';
  debugMode: boolean;
  disableSyntaxHighlighting: boolean;
  syntaxHighlightLanguages: string;
  exportAuthor: string;
}

export const DEFAULT_LANGUAGES = 'javascript,typescript,jsx,tsx,html,xml,css,scss,sass,c,cpp,c++,h,hpp,c#,csharp,cs,java,rust,go,ruby,swift,kotlin,scala,objective-c,objectivec,objc,python,py,perl,php,lua,raku,bash,sh,shell,powershell,ps1,cmd,batch,awk,tcl,json,jsonc,json5,yaml,yml,ini,toml,sql,pgsql,postgresql,mysql,sqlite,haskell,ocaml,fsharp,erlang,elixir,clojure,dart,flutter,groovy,gradle,maven,dockerfile,docker,cmake,makefile,markdown,md,latex,tex,asciidoc,adoc,protobuf,proto,thrift,graphql,diff,patch,vim,nginx,apache,apacheconf,lighttpd,terraform,hcl,ansible,puppet,r,julia,matlab,octave,vb,vbnet,vba,vbscript,basic,pascal,delphi,lazarus,fpc';

export const DEFAULT_SETTINGS: AdvancedHtmlExportSettings = {
  imageQuality: 'medium',
  enableLazyLoading: true,
  enableImageDeduplication: true,
  exportCompression: 'none',
  timestampFormat: DEFAULT_TIMESTAMP_FORMAT,
  showExportStatistics: false,
  linkDepth: 1,
  includeUnlinked: false,
  wikiTitle: '',
  enableThemeToggle: true,
  enableInlineTOC: true,
  defaultTheme: 'light',
  debugMode: false,
  disableSyntaxHighlighting: true,
  syntaxHighlightLanguages: DEFAULT_LANGUAGES,
  exportAuthor: '',
};

/**
 * Resolves the timestamp format for one export. Frontmatter `export.timestamp`
 * accepts `false` (off), `true` (use the setting) or a format string; a format
 * string wins over the setting. Returns `false` when timestamps are disabled.
 */
export function resolveTimestampFormat(
  frontmatterValue: unknown,
  settingFormat: string,
): string | false {
  if (frontmatterValue === false) return false;
  if (typeof frontmatterValue === 'string' && frontmatterValue.trim().length > 0) {
    return frontmatterValue.trim();
  }
  const fallback = settingFormat.trim();
  if (fallback.length > 0) return fallback;
  return frontmatterValue === true ? DEFAULT_TIMESTAMP_FORMAT : false;
}
