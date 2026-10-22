import { useQueryClient } from '@tanstack/react-query'
import { randomUUID } from 'expo-crypto'
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import apiClient, { clearAuthToken, setAuthToken, setGuestSessionId } from '../lib/apiClient'
import { clearUserSession, loadUserSession, saveUserSession, getGuestUserId, touchUserSession, userSessionExpired } from '../lib/storage'
import { getUserId } from '../lib/customerData'

const UserContext = createContext(null)

function normalizeUser(user) {
  if (!user) {
    return null
  }

  return {
    ...user,
    id: user.id || user.ma_nguoi_dung || user.sub || null,
    ma_nguoi_dung: user.ma_nguoi_dung || user.id || user.sub || null,
    full_name: user.full_name || user.ho_ten || user.hoTen || user.hoTen || user.tenDangNhap || user.email || '',
    phone: user.phone || user.so_dien_thoai || user.soDienThoai || '',
    avatar_url: user.avatar_url || user.avatarUrl || null,
    loyalty_points: Number(user.loyalty_points ?? user.diem_loyalty ?? 0),
    membership_tier: user.membership_tier || user.hang_thanh_vien?.ma_hang || user.hang_thanh_vien?.hang || 'MEMBER',
  }
}

export function UserProvider({ children }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [guestId, setGuestId] = useState(null)
  const [cartMergeError, setCartMergeError] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const lastTouchWrite = useRef(0)
  const sessionVersion = useRef(0)

  useEffect(() => {
    ; (async () => {
      try {
      const anonId = await getGuestUserId()
      setGuestId(anonId)
      setGuestSessionId(anonId)
      const session = await loadUserSession()
      if (session.user && session.token) {
        const nextUser = normalizeUser(session.user)
        setUser(nextUser)
        setToken(session.token)
        await setAuthToken(session.token)
      } else {
        await clearUserSession()
        await clearAuthToken()
      }
      } catch {
        setUser(null); setToken(null)
        await clearAuthToken().catch(() => {})
        const recoveryId = `anon-${randomUUID()}`
        setGuestId(recoveryId); setGuestSessionId(recoveryId)
      } finally { setHydrated(true) }
    })()
  }, [])

  const completeLogin = async response => {
    const nextToken = response?.accessToken || response?.token || response?.data?.accessToken || response?.data?.token || ''
    const nextUser = normalizeUser(response?.user || response?.data?.user)

    if (typeof nextToken !== 'string' || !nextToken || !nextUser?.id) {
      throw new Error('Chưa nhận được phiên đăng nhập hợp lệ. Bạn hãy thử lại.')
    }

    ++sessionVersion.current
    setUser(nextUser)
    setToken(nextToken)
    await setAuthToken(nextToken)
    await saveUserSession(nextUser, nextToken)
    await touchUserSession()

    // Same guest capability merge as web; failed merges remain retryable.
    try {
      await apiClient.post('/cart/merge-guest', { guest_session_id: guestId }, {
        headers: { 'x-guest-session-id': guestId, 'x-idempotency-key': randomUUID() },
      })
      setCartMergeError('')
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart'] })
    } catch { setCartMergeError('Chưa chuyển được giỏ khách. Chạm để thử lại.') }
    return nextUser
  }

  const login = async ({ taiKhoan, matKhau, email }) => {
    const raw = String(taiKhoan || email || '').trim()
    const identifier = raw.includes('@') ? raw.toLowerCase() : raw
    const password = String(matKhau || '')
    if (!identifier || !password) throw new Error('Bạn hãy nhập tài khoản và mật khẩu.')
    return completeLogin(await apiClient.post('/auth/login', {
      tai_khoan: identifier, mat_khau: password, email: identifier, password,
    }))
  }
  const loginGoogle = async (googleToken, recaptchaToken) => {
    if (!googleToken) throw new Error('Chưa nhận được xác thực Google. Bạn hãy thử lại.')
    if (recaptchaToken) {
      const verification = await apiClient.post('/auth/recaptcha/verify', { recaptchaToken })
      if (!verification?.success) throw new Error('Xác thực chưa thành công. Bạn hãy thử lại.')
    }
    return completeLogin(await apiClient.post('/auth/google', { googleToken, isAccessToken: true, ...(recaptchaToken ? { recaptchaToken } : {}) }))
  }

  const retryCartMerge = async () => {
    await apiClient.post('/cart/merge-guest', { guest_session_id: guestId }, {
      headers: { 'x-guest-session-id': guestId, 'x-idempotency-key': randomUUID() },
    })
    setCartMergeError('')
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart'] })
  }
  const updateSession = async (nextUser, nextToken = token) => {
    const normalizedUser = normalizeUser(nextUser)
    setUser(normalizedUser)

    if (nextToken) {
      setToken(nextToken)
      await setAuthToken(nextToken)
      await saveUserSession(normalizedUser, nextToken)
      return normalizedUser
    }

    await saveUserSession(normalizedUser, token)
    return normalizedUser
  }

  const refreshProfile = async () => {
    const userId = getUserId(user)
    if (!userId) {
      return null
    }

    const version = sessionVersion.current
    const profile = await apiClient.get(`/users/${userId}/profile`)
    const loyalty = await apiClient.get(`/users/${userId}/loyalty`).catch(() => null)
    if (version !== sessionVersion.current) return null

    const nextUser = normalizeUser({
      ...user,
      ...profile,
      loyalty_points: loyalty?.diem ?? loyalty?.diem_hien_tai ?? user?.loyalty_points,
      membership_tier: loyalty?.hang_thanh_vien?.ma_hang || loyalty?.hang_thanh_vien?.hang || user?.membership_tier,
    })

    setUser(nextUser)
    await saveUserSession(nextUser, token)
    return nextUser
  }

  const logout = async () => {
    ++sessionVersion.current
    setUser(null)
    setToken(null)
    queryClient.clear()
    await clearAuthToken()
    await clearUserSession()
  }

  const verifyIdle = async () => {
    if (token && await userSessionExpired()) await logout()
  }
  const touchSession = async () => {
    if (!token) return
    if (await userSessionExpired()) { await logout(); return }
    if (Date.now() - lastTouchWrite.current < 15000) return
    lastTouchWrite.current = Date.now()
    await touchUserSession()
  }

  useEffect(() => {
    if (!token) return undefined
    const timer = setInterval(verifyIdle, 30000)
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') verifyIdle() })
    return () => { clearInterval(timer); subscription.remove() }
  }, [token])

  const activeUserId = useMemo(() => {
    return user?.id || user?.ma_nguoi_dung || guestId || 'guest-customer'
  }, [user, guestId])

  const value = useMemo(
    () => ({
      user,
      token,
      guestId,
      activeUserId,
      hydrated,
      cartMergeError,
      retryCartMerge,
      login,
      loginGoogle,
      updateSession,
      refreshProfile,
      logout,
      touchSession,
    }),
    [hydrated, user, token, guestId, activeUserId, cartMergeError],
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser() {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUser must be used within UserProvider')
  }
  return context
}
