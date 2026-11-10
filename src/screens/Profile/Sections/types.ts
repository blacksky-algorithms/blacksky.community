export interface SectionRef {
  scrollToTop: () => void
  refresh?: () => Promise<void>
}
