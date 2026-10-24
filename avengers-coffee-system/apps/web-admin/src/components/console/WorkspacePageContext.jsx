import { createContext, useContext, useEffect } from 'react'

export const WorkspacePageContext = createContext(null)
/** Presentation only: the shell owns the single page heading and breadcrumb. */
export function useWorkspacePage(title, description = '') {
  const setPage = useContext(WorkspacePageContext)
  useEffect(() => {
    if (!setPage) return
    setPage(title ? { title, description } : null)
    return () => setPage(null)
  }, [setPage, title, description])
}
