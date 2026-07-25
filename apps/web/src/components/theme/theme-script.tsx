import { THEME_STORAGE_KEY } from './theme'

/**
 * Runs before first paint so the stored theme is applied without a flash.
 * Kept dependency-free and synchronous on purpose.
 */
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){/* storage blocked: keep system theme */}})();`

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
}
