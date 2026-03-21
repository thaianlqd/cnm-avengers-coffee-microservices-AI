import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { API_BASE_URL } from '../../admin-dashboard/constants'

const AI_URL = `${API_BASE_URL}/ai`

async function aiFetch(path, options = {}) {
  const res = await fetch(`${AI_URL}${path}`, options)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AI ${path}: ${res.status} ${text}`)
  }
  return res.json()
}

export function useAiAnalytics() {
  const queryClient = useQueryClient()
  const [branchCode, setBranchCode] = useState('ALL')
  const [metric, setMetric] = useState('orders')
  const [historyDays, setHistoryDays] = useState(30)
  const [forecastDays, setForecastDays] = useState(14)
  const [testUserId, setTestUserId] = useState('')

  // ── Model stats ──────────────────────────────────────────────────────────
  const modelStatsQuery = useQuery({
    queryKey: ['ai', 'model-stats'],
    queryFn: () => aiFetch('/model/stats'),
    staleTime: 60_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  })

  // ── Forecast (combined history + future) ─────────────────────────────────
  const forecastQuery = useQuery({
    queryKey: ['ai', 'forecast', branchCode, metric, historyDays, forecastDays],
    queryFn: () =>
      aiFetch(
        `/forecast/combined?branch_code=${branchCode}&metric=${metric}&history_days=${historyDays}&forecast_days=${forecastDays}`,
      ),
    staleTime: 120_000,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    retry: 1,
    enabled: true,
  })

  // ── Recommendations test ──────────────────────────────────────────────────
  const [activeTestUserId, setActiveTestUserId] = useState('')
  const recommendQuery = useQuery({
    queryKey: ['ai', 'recommend', activeTestUserId],
    queryFn: () => aiFetch(`/recommend/${encodeURIComponent(activeTestUserId)}?limit=6`),
    staleTime: 30_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
    enabled: Boolean(activeTestUserId),
  })

  // ── Retrain mutations ─────────────────────────────────────────────────────
  const retrainCfMutation = useMutation({
    mutationFn: () => aiFetch('/recommend/train', { method: 'POST' }),
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['ai'] })
      }, 3000)
    },
  })

  const retrainForecastMutation = useMutation({
    mutationFn: () => aiFetch('/forecast/train', { method: 'POST' }),
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['ai'] })
      }, 3000)
    },
  })

  // ── Run recommendation test ───────────────────────────────────────────────
  const runRecommendTest = (userId) => {
    const trimmed = userId?.trim()
    if (trimmed) {
      setActiveTestUserId(trimmed)
    }
  }

  return {
    // state
    branchCode, setBranchCode,
    metric, setMetric,
    historyDays, setHistoryDays,
    forecastDays, setForecastDays,
    testUserId, setTestUserId,
    activeTestUserId,

    // queries
    modelStatsQuery,
    forecastQuery,
    recommendQuery,

    // actions
    retrainCfMutation,
    retrainForecastMutation,
    runRecommendTest,
  }
}
