import React, { createContext, useContext, useEffect, useMemo, useCallback, useState } from 'react'
import { AppState } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import apiClient, { setAuthToken, clearAuthToken } from '../lib/apiClient'
import { clearAdminSession, loadAdminSession, saveAdminSession, adminSessionExpired, touchAdminSession } from '../lib/storage'
import { getUserRole } from '../lib/adminData'

const AdminContext = createContext(null)

export function AdminProvider({ children }) {
  const queryClient = useQueryClient()
  const [admin, setAdmin] = useState(null)
  const [token, setToken] = useState(null)
  const [hydrated, setHydrated] = useState(false)
  const [loginStatus, setLoginStatus] = useState({ loading: false, error: null })

  // Hydrate session from storage on mount
  useEffect(() => {
    ;(async () => {
      try {
        const session = await loadAdminSession()
        if (session?.admin && session?.token) {
          setAdmin(session.admin)
          setToken(session.token)
          setAuthToken(session.token)
        }
      } catch (e) {
        console.warn('Failed to hydrate admin session:', e)
      } finally {
        setHydrated(true)
      }
    })()
  }, [])

  /**
   * Login - gửi { email, password } đúng như web-admin
   * identifier có thể là username hoặc email
   */
  const login = useCallback(async ({ identifier, password }) => {
    setLoginStatus({ loading: true, error: null })
    try {
      const response = await apiClient.post('/auth/login', {
        email: identifier,
        password,
      })

      const rawToken =
        response?.token ||
        response?.accessToken ||
        response?.data?.token ||
        response?.data?.accessToken ||
        null

      const rawUser =
        response?.user ||
        response?.data?.user ||
        response?.data ||
        null

      if (!rawToken || !rawUser) {
        throw new Error('Phản hồi đăng nhập không hợp lệ.')
      }

      const normalizedAdmin = {
        maNguoiDung: rawUser.maNguoiDung || rawUser.ma_nguoi_dung || rawUser.id || '',
        email: rawUser.email || '',
        ho_ten: rawUser.ho_ten || rawUser.tenDangNhap || rawUser.email || '',
        tenDangNhap: rawUser.tenDangNhap || rawUser.ten_dang_nhap || rawUser.email || '',
        so_dien_thoai: rawUser.so_dien_thoai || '',
        avatar_url: rawUser.avatar_url || null,
        role: getUserRole(rawUser),
        vaiTro: rawUser.vaiTro || rawUser.vai_tro || 'STAFF',
        coSoTen: rawUser.coSoTen || rawUser.co_so_ten || '',
        coSoMa: (rawUser.coSoMa || rawUser.co_so_ma || 'MAC_DINH_CHI').toUpperCase(),
      }

      setAdmin(normalizedAdmin)
      setToken(rawToken)
      setAuthToken(rawToken)
      await saveAdminSession(normalizedAdmin, rawToken)
      setLoginStatus({ loading: false, error: null })
      return normalizedAdmin
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Đăng nhập thất bại.'
      setLoginStatus({ loading: false, error: message })
      throw new Error(message)
    }
  }, [])

  const updateSession = useCallback(
    async (nextAdmin, nextToken = token) => {
      setAdmin(nextAdmin)
      if (nextToken) {
        setToken(nextToken)
        setAuthToken(nextToken)
        await saveAdminSession(nextAdmin, nextToken)
        return
      }
      await saveAdminSession(nextAdmin, token)
    },
    [token],
  )

  const logout = useCallback(async () => {
    setAdmin(null)
    setToken(null)
    clearAuthToken()
    queryClient.clear()
    await clearAdminSession()
  }, [queryClient])

  const touchSession = useCallback(async () => {
    if (!token) return
    if (await adminSessionExpired()) { await logout(); return }
    await touchAdminSession()
  }, [token, logout])

  useEffect(() => {
    if (!token) return undefined
    const verify = async () => { if (await adminSessionExpired()) await logout() }
    const timer = setInterval(verify, 1000)
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') verify() })
    return () => { clearInterval(timer); subscription.remove() }
  }, [token, logout])

  const sessionUsername = admin?.tenDangNhap || admin?.email || ''
  const sessionRole = admin?.vaiTro || admin?.role || 'STAFF'
  const sessionBranchCode = (admin?.coSoMa || 'MAC_DINH_CHI').toUpperCase()

  const value = useMemo(
    () => ({
      admin,
      token,
      hydrated,
      loginStatus,
      login,
      updateSession,
      logout,
      touchSession,
      sessionUsername,
      sessionRole,
      sessionBranchCode,
    }),
    [admin, token, hydrated, loginStatus, login, updateSession, logout, touchSession, sessionUsername, sessionRole, sessionBranchCode],
  )

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export function useAdmin() {
  const context = useContext(AdminContext)
  if (!context) {
    throw new Error('useAdmin must be used within AdminProvider')
  }
  return context
}
