import GoogleVerification, { googleVerificationEnabled } from '../components/GoogleVerification'
import TextInput from '../components/TextInput'
import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text,  View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Path } from 'react-native-svg'
import { LinearGradient } from 'expo-linear-gradient'
import Image from '../components/CachedImage'
import { useUser } from '../context/UserContext'
import useGoogleSignIn from '../hooks/useGoogleSignIn'
import api from '../lib/apiClient'
import { authError, identifierPayload, registrationPayload, resetPasswordPayload } from '../lib/customerAuth.mjs'

function Field({ label, icon, password = false, ...props }) {
  const [focused, setFocused] = useState(false), [visible, setVisible] = useState(false)
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={[styles.inputWrap, focused && styles.focus]}>
    <Ionicons name={icon || 'mail-outline'} size={18} color={focused ? '#b22830' : '#727680'} />
    <TextInput accessibilityLabel={label} autoCapitalize="none" autoCorrect={false} placeholderTextColor="#92959c" {...props} secureTextEntry={password && !visible} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={styles.input} />
    {password && <Pressable accessibilityLabel={`${visible ? 'Ẩn' : 'Hiện'} ${label.toLowerCase()}`} onPress={() => setVisible(value => !value)} hitSlop={8} style={styles.eye}><Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={19} color="#626874" /></Pressable>}
  </View></View>
}
function GoogleMark() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false}>
    <Path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.61 4.61 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36z" />
    <Path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.61 0-4.82-1.76-5.61-4.12H3.05v2.59A10 10 0 0 0 12 22z" />
    <Path fill="#FBBC05" d="M6.39 13.92a6 6 0 0 1 0-3.84V7.49H3.05a10 10 0 0 0 0 9.02z" />
    <Path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.95 5.49l3.34 2.59C7.18 7.72 9.39 5.96 12 5.96z" />
  </Svg>
}
export function LoginScreen({ navigation }) {
  const { login, loginGoogle } = useUser(), google = useGoogleSignIn(), insets = useSafeAreaInsets()
  const [googleDialog, setGoogleDialog] = useState(false)
  const [mode, setMode] = useState('login'), [form, setForm] = useState({ identifier: '', name: '', password: '', confirm: '' })
  const [otp, setOtp] = useState(''), [recoveryIdentifier, setRecoveryIdentifier] = useState('')
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [pending, setPending] = useState('')
  const [resendAt, setResendAt] = useState(0), [now, setNow] = useState(Date.now())
  const busy = useRef(false), alive = useRef(true), scroll = useRef(null)
  const waiting = Math.max(0, Math.ceil((resendAt - now) / 1000))
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (!resendAt) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [resendAt])
  useEffect(() => { const listener = BackHandler.addEventListener('hardwareBackPress', () => busy.current); return () => listener.remove() }, [])
  const back = () => { if (busy.current) return; if (navigation.canGoBack()) navigation.goBack(); else navigation.navigate('Tabs') }
  const change = (key, value) => { setForm(old => ({ ...old, [key]: value })); setError('') }
  const switchMode = next => {
    if (busy.current) return
    setMode(next); setError(''); setNotice(''); setOtp(''); setRecoveryIdentifier('')
    setForm(old => ({ ...old, password: '', confirm: '' })); scroll.current?.scrollTo({ y: 0, animated: false })
  }
  const perform = async (kind, task) => {
    if (busy.current) return
    busy.current = true; setPending(kind); setError('')
    try { await task() } catch (failure) {
      if (alive.current) {
        setError(authError(failure))
        const retry = Number(failure?.response?.data?.retry_after_seconds)
        if (retry > 0) { setResendAt(Date.now() + retry * 1000); setNow(Date.now()) }
      }
    } finally { busy.current = false; if (alive.current) setPending('') }
  }
  const requestCode = () => perform('otp', async () => {
    const identifier = mode === 'reset' ? recoveryIdentifier : form.identifier.trim()
    const response = await api.post('/auth/forgot-password/request', identifierPayload(identifier))
    if (!alive.current) return
    setRecoveryIdentifier(identifier); setMode('reset'); setOtp(''); setResendAt(Date.now() + 60000); setNow(Date.now())
    setNotice(response?.message || 'Nếu tài khoản tồn tại, mã xác thực đã được gửi về email của bạn.')
    setForm(old => ({ ...old, password: '', confirm: '' }))
  })
  const submit = () => {
    if (mode === 'forgot') { requestCode(); return }
    perform(mode, async () => {
      if (mode === 'login') {
        await login({ taiKhoan: form.identifier, matKhau: form.password })
        if (alive.current) { if (navigation.canGoBack()) navigation.goBack(); else navigation.navigate('Tabs') }
      } else if (mode === 'register') {
        await api.post('/auth/register', registrationPayload({ name: form.name, email: form.identifier, password: form.password, confirm: form.confirm }))
        if (alive.current) { setMode('login'); setForm(old => ({ ...old, password: '', confirm: '' })); setNotice('Tài khoản đã được tạo. Bạn có thể đăng nhập ngay.'); scroll.current?.scrollTo({ y: 0, animated: false }) }
      } else {
        await api.post('/auth/forgot-password/reset', resetPasswordPayload(recoveryIdentifier, otp, form.password, form.confirm))
        if (alive.current) { setMode('login'); setOtp(''); setRecoveryIdentifier(''); setForm(old => ({ ...old, password: '', confirm: '' })); setNotice('Đã đặt lại mật khẩu. Bạn đăng nhập với mật khẩu mới nhé.'); scroll.current?.scrollTo({ y: 0, animated: false }) }
      }
    })
  }
  const googleLogin = captchaToken => perform('google', async () => {
    const token = await google.signIn()
    if (!token || !alive.current) return
    await loginGoogle(token, captchaToken)
    if (alive.current) { if (navigation.canGoBack()) navigation.goBack(); else navigation.navigate('Tabs') }
  })
  const isRecovery = mode === 'forgot' || mode === 'reset'
  const title = { login: 'Chào mừng trở lại', register: 'Tạo tài khoản của bạn', forgot: 'Quên mật khẩu?', reset: 'Đặt mật khẩu mới' }[mode]
  const subtitle = { login: 'Một tài khoản cho những ly cà phê bạn yêu thích.', register: 'Lưu đơn hàng, tích điểm và nhận ưu đãi dành cho bạn.', forgot: 'Nhập email hoặc tên đăng nhập. Chúng mình sẽ gửi mã xác thực về email đã đăng ký.', reset: 'Nhập mã 6 chữ số trong email và chọn mật khẩu mới.' }[mode]
  const button = { login: 'Đăng nhập', register: 'Tạo tài khoản', forgot: 'Gửi mã xác thực', reset: 'Lưu mật khẩu mới' }[mode]
  return <View style={styles.screen}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={[styles.hero, { height: isRecovery ? 175 + insets.top : 215 + insets.top }]}>
        <Image source={require('../../assets/campaigns/highlands-christmas-office.jpg')} resizeMode="cover" style={StyleSheet.absoluteFillObject} />
        <LinearGradient colors={['#12131566', '#121315aa']} style={StyleSheet.absoluteFillObject} />
        <Pressable disabled={Boolean(pending)} onPress={isRecovery ? () => switchMode('login') : back} accessibilityLabel={isRecovery ? 'Quay lại đăng nhập' : 'Quay lại'} style={[styles.back, { top: insets.top + 14 }]}><Ionicons name="arrow-back" size={20} color="#fff" /></Pressable>
        <View style={styles.heroCopy}><Image source={require('../../assets/branding/logo-white.png')} resizeMode="contain" style={styles.logo} /><View><Text style={styles.brand}>Avengers Coffee</Text></View></View>
      </View>
      <View style={styles.content}>
        {!isRecovery && <View style={styles.tabs}>{[['login', 'Đăng nhập'], ['register', 'Đăng ký']].map(([value,label]) => <Pressable key={value} disabled={Boolean(pending)} accessibilityRole="tab" accessibilityState={{ selected: value === mode }} onPress={() => switchMode(value)} style={[styles.tab, value === mode && styles.activeTab]}><Text style={[styles.tabText, value === mode && styles.activeText]}>{label}</Text></Pressable>)}</View>}
        {isRecovery && <View style={styles.steps}><Text style={styles.stepActive}>1. Nhận mã</Text><View style={styles.stepLine}/><Text style={mode === 'reset' ? styles.stepActive : styles.stepMuted}>2. Đặt mật khẩu</Text></View>}
        <Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text>
        {!!notice && <View style={styles.notice}><Ionicons name="information-circle-outline" size={18} color="#2563eb" /><Text accessibilityLiveRegion="polite" style={styles.noticeText}>{notice}</Text></View>}
        {mode === 'register' && <Field label="Họ và tên" icon="person-outline" value={form.name} onChangeText={value => change('name', value)} editable={!pending} placeholder="Tên của bạn" autoCapitalize="words" textContentType="name" autoComplete="name" />}
        {mode !== 'reset' ? <Field label={mode === 'register' ? 'Email' : 'Email hoặc tên đăng nhập'} value={form.identifier} onChangeText={value => change('identifier', value)} editable={!pending} placeholder={mode === 'register' ? 'ban@example.com' : 'Nhập tài khoản của bạn'} keyboardType={mode === 'register' ? 'email-address' : 'default'} textContentType="username" autoComplete="username" returnKeyType="next" /> : <View style={styles.recipient}><Ionicons name="mail-outline" size={17} color="#666" /><Text style={styles.recipientText}>{recoveryIdentifier}</Text><Pressable disabled={Boolean(pending)} onPress={() => switchMode('forgot')} accessibilityLabel="Đổi email nhận mã"><Text style={styles.link}>Đổi</Text></Pressable></View>}
        {mode === 'reset' && <Field label="Mã xác thực" icon="keypad-outline" value={otp} onChangeText={value => { setOtp(value.replace(/\D/g, '').slice(0,6)); setError('') }} editable={!pending} placeholder="6 chữ số" keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" autoComplete="one-time-code" />}
        {mode !== 'forgot' && <Field key={`${mode}-password`} label={mode === 'reset' ? 'Mật khẩu mới' : 'Mật khẩu'} password icon="lock-closed-outline" value={form.password} onChangeText={value => change('password', value)} editable={!pending} placeholder={mode === 'login' ? 'Nhập mật khẩu' : 'Ít nhất 6 ký tự'} textContentType={mode === 'login' ? 'password' : 'newPassword'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} returnKeyType="done" onSubmitEditing={mode === 'login' ? submit : undefined} />}
        {['register','reset'].includes(mode) && <Field label="Xác nhận mật khẩu" password icon="shield-checkmark-outline" value={form.confirm} onChangeText={value => change('confirm', value)} editable={!pending} placeholder="Nhập lại mật khẩu" textContentType="newPassword" autoComplete="new-password" returnKeyType="done" onSubmitEditing={submit} />}
        {mode === 'login' && <Pressable disabled={Boolean(pending)} onPress={() => switchMode('forgot')} style={styles.forgot}><Text style={styles.link}>Quên mật khẩu?</Text></Pressable>}
        {!!error && <View style={styles.error}><Ionicons name="alert-circle-outline" size={18} color="#b22830" /><Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.errorText}>{error}</Text></View>}
        <Pressable accessibilityRole="button" accessibilityLabel={button} disabled={Boolean(pending) || (mode === 'forgot' && waiting > 0)} onPress={submit} style={[styles.primary, (pending || (mode === 'forgot' && waiting > 0)) && styles.disabled]}>{pending && pending !== 'google' && <ActivityIndicator color="#fff" size="small"/>}<Text style={styles.primaryText}>{pending && pending !== 'google' ? 'Đang xử lý…' : button}</Text></Pressable>
        {mode === 'reset' && <View style={styles.resend}><Text style={styles.hint}>Chưa nhận được mã?</Text><Pressable accessibilityRole="button" accessibilityLabel="Gửi lại mã xác thực" disabled={Boolean(pending) || waiting > 0} onPress={requestCode}><Text style={[styles.link, (waiting > 0 || pending) && styles.muted]}>{waiting > 0 ? `Gửi lại sau ${waiting}s` : 'Gửi lại mã'}</Text></Pressable></View>}
        {mode === 'forgot' && waiting > 0 && <Text style={styles.hint}>Bạn có thể yêu cầu lại sau {waiting}s.</Text>}
        {!isRecovery && <><View style={styles.divider}><View style={styles.line}/><Text style={styles.hint}>hoặc</Text><View style={styles.line}/></View><Pressable accessibilityRole="button" accessibilityLabel={mode === 'register' ? 'Đăng ký với Google' : 'Tiếp tục với Google'} disabled={Boolean(pending) || !google.ready} onPress={() => googleVerificationEnabled ? setGoogleDialog(true) : googleLogin()} style={[styles.google, (pending || !google.ready) && styles.disabled]}>{google.loading || pending === 'google' ? <ActivityIndicator size="small" color="#b22830" /> : <GoogleMark/>}<Text style={styles.googleText}>{pending === 'google' ? 'Đang đăng nhập Google…' : mode === 'register' ? 'Đăng ký với Google' : 'Tiếp tục với Google'}</Text></Pressable><Text style={styles.socialHint}>{google.loading ? 'Đang kết nối Google…' : !google.ready ? 'Google chưa khả dụng trên bản này. Bạn có thể dùng email.' : 'Tài khoản Google mới sẽ được tạo tự động khi bạn tiếp tục.'}</Text></>}
        {isRecovery && <Pressable disabled={Boolean(pending)} onPress={() => switchMode('login')} style={styles.return}><Text style={styles.link}>Quay lại đăng nhập</Text></Pressable>}
        <View style={styles.footer}><Ionicons name="shield-checkmark-outline" size={14} color="#777"/><Text style={styles.footerText}>Thông tin đăng nhập được xác thực qua hệ thống Highlands.</Text></View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView><GoogleVerification visible={googleDialog} onClose={() => setGoogleDialog(false)} onContinue={googleLogin} /></View>
}
const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:'#fff'},hero:{position:'relative',overflow:'hidden'},back:{position:'absolute',left:16,width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#ffffff26'},heroCopy:{position:'absolute',bottom:24,left:22,right:22,flexDirection:'row',gap:13,alignItems:'center'},logo:{width:64,height:50},brand:{fontSize:13,fontWeight:'600',letterSpacing:1.2,color:'#fff'},brandSub:{fontSize:11,lineHeight:17,color:'#eee',marginTop:5},content:{paddingHorizontal:22,paddingTop:22,gap:0},tabs:{flexDirection:'row',backgroundColor:'#f5f5f6',padding:4,borderRadius:12,marginBottom:25},tab:{flex:1,alignItems:'center',paddingVertical:11,borderRadius:9},activeTab:{backgroundColor:'#fff',shadowColor:'#000',shadowOpacity:.05,shadowRadius:4,elevation:1},tabText:{fontSize:13,fontWeight:'500',color:'#737680'},activeText:{color:'#b22830',fontWeight:'600'},title:{fontSize:23,lineHeight:30,fontWeight:'600',letterSpacing:-.5,color:'#24262b'},subtitle:{fontSize:12,lineHeight:19,color:'#70747b',marginTop:7,marginBottom:22},field:{marginBottom:15},label:{fontSize:12,fontWeight:'600',color:'#444950',marginBottom:8},inputWrap:{flexDirection:'row',alignItems:'center',gap:10,minHeight:48,borderWidth:1,borderColor:'#e0e2e6',borderRadius:10,paddingHorizontal:13,backgroundColor:'#fafafb'},focus:{borderColor:'#b22830',backgroundColor:'#fff'},input:{flex:1,minWidth:0,fontSize:14,color:'#282a30',paddingVertical:12,...(Platform.OS==='web'?{outlineStyle:'none'}:{})},eye:{padding:4},forgot:{alignSelf:'flex-end',paddingVertical:6,marginTop:-4,marginBottom:14},link:{fontSize:12,fontWeight:'600',color:'#b22830'},primary:{minHeight:48,backgroundColor:'#b22830',borderRadius:11,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:9,marginTop:5},primaryText:{fontSize:14,fontWeight:'600',color:'#fff'},disabled:{opacity:.5},divider:{flexDirection:'row',alignItems:'center',gap:14,marginVertical:20},line:{flex:1,height:1,backgroundColor:'#ededf0'},hint:{fontSize:11,lineHeight:17,color:'#787b83'},google:{minHeight:48,flexDirection:'row',gap:12,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#dfe1e5',borderRadius:11},googleText:{fontSize:13,fontWeight:'500',color:'#33363d'},socialHint:{fontSize:10,lineHeight:16,color:'#83868d',textAlign:'center',marginTop:12},notice:{flexDirection:'row',alignItems:'flex-start',gap:9,padding:12,borderRadius:9,backgroundColor:'#eff6ff',marginBottom:18},noticeText:{flex:1,fontSize:12,lineHeight:19,color:'#245b9d'},error:{flexDirection:'row',gap:8,padding:11,borderRadius:9,backgroundColor:'#fff0f0',marginBottom:12},errorText:{flex:1,fontSize:12,lineHeight:18,color:'#a5222b'},steps:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:22},stepActive:{fontSize:11,fontWeight:'600',color:'#b22830'},stepMuted:{fontSize:11,color:'#979ba3'},stepLine:{height:1,width:28,backgroundColor:'#e3e4e7'},recipient:{flexDirection:'row',alignItems:'center',gap:9,backgroundColor:'#f6f7f9',padding:12,borderRadius:10,marginBottom:16},recipientText:{flex:1,fontSize:12,color:'#565a63'},resend:{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:8,marginTop:18},muted:{color:'#92959c'},return:{alignItems:'center',padding:16,marginTop:10},footer:{flexDirection:'row',gap:6,alignItems:'center',justifyContent:'center',marginTop:27},footerText:{flex:1,fontSize:10,lineHeight:16,color:'#92959b'},
})
