// 背景の明るさは、新着の画面に合わせて暗い表示に固定する(切り替えのスイッチは置かない)。
export function useTheme(): "light" | "dark" {
  return "dark";
}
