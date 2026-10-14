import TextInput from '../components/TextInput'
import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text,  View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useIsFocused } from '@react-navigation/native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import apiClient from '../lib/apiClient'
import { useUser } from '../context/UserContext'
import { getUserDisplayName, safeArray } from '../lib/customerData'
import { colors } from '../theme'

export default function StaffChatPanel({ navigation }) {
  const { user, activeUserId } = useUser()
  return <StaffConversation key={activeUserId} owner={activeUserId} name={getUserDisplayName(user)} navigation={navigation} />
}
function StaffConversation({ owner, name, navigation }) {
  const focused = useIsFocused(), queryClient = useQueryClient(), list = useRef(null), sending = useRef(false), lastRead = useRef(null)
  const [active, setActive] = useState(AppState.currentState !== 'background')
  const [draft, setDraft] = useState(''), [pending, setPending] = useState(false), [error, setError] = useState(''), [connected, setConnected] = useState(false)
  const visible = focused && active
  useEffect(() => { const listener = AppState.addEventListener('change',state=>setActive(state==='active')); return ()=>listener.remove() }, [])
  const conversation = useQuery({ queryKey: ['customer','staff-chat','conversation',owner], queryFn: async ({ signal }) => {
    const response=await apiClient.post('/chat/conversations/open',{customer_user_id:owner,customer_name:name},{signal})
    const value=response?.conversation || response?.data?.conversation
    if (!value?.ma_hoi_thoai) throw new Error('Chưa mở được cuộc trò chuyện')
    return value
  }, enabled: visible && Boolean(owner), staleTime: Infinity, retry: false })
  const id=conversation.data?.ma_hoi_thoai, key=['customer','staff-chat','messages',owner,id]
  const messages=useQuery({queryKey:key,queryFn:({signal})=>apiClient.get(`/chat/conversations/${id}/messages`,{params:{user_id:owner,role:'CUSTOMER'},signal}),enabled:visible&&Boolean(id),refetchInterval:visible?5000:false,retry:1})
  const rows=safeArray(messages.data?.items || messages.data?.data?.items).filter(message=>message.vai_tro_nguoi_gui!=='AI')
  useEffect(() => {
    if (!visible || !id) return
    const apiBase=process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'
    const socketBase=process.env.EXPO_PUBLIC_SOCKET_URL || apiBase.replace(/:\d+(?=\/|$)/, ':3005').replace(/\/$/, '')
    const socket=io(`${socketBase}/chat`,{transports:['websocket'],auth:{userId:owner,role:'CUSTOMER'}})
    const refresh=()=>queryClient.invalidateQueries({queryKey:['customer','staff-chat','messages',owner,id]})
    socket.on('connect',()=>{setConnected(true);socket.emit('chat:subscribe',{userId:owner,role:'CUSTOMER'});socket.emit('chat:conversation:join',{conversationId:id});refresh()})
    socket.on('disconnect',()=>setConnected(false));socket.on('connect_error',()=>setConnected(false))
    socket.on('chat:message:new',message=>{if(String(message.ma_hoi_thoai)===String(id))refresh()})
    return ()=>{socket.removeAllListeners();socket.disconnect()}
  },[visible,id,owner,queryClient])
  useEffect(() => {
    if (!visible || !id || !messages.data) return
    const latest=safeArray(messages.data.items).filter(message=>['STAFF','MANAGER'].includes(message.vai_tro_nguoi_gui)).at(-1)
    if (!latest?.id || lastRead.current===latest.id) return
    const controller=new AbortController()
    apiClient.patch(`/chat/conversations/${id}/read`,{reader_user_id:owner,reader_role:'CUSTOMER'},{signal:controller.signal}).then(()=>{lastRead.current=latest.id}).catch(()=>{})
    return ()=>controller.abort()
  },[visible,id,owner,messages.dataUpdatedAt])
  const send=async()=>{
    const content=draft.trim()
    if (!content || !id || sending.current || content.length>2000) return
    sending.current=true;setPending(true);setError('')
    try {
      const response=await apiClient.post(`/chat/conversations/${id}/messages`,{sender_user_id:owner,sender_name:name,sender_role:'CUSTOMER',content})
      const message=response?.message || response?.data?.message
      if (!message?.id) throw new Error('Chưa xác nhận được tin nhắn')
      queryClient.setQueryData(key,previous=>({...previous,items:[...safeArray(previous?.items).filter(item=>item.id!==message.id),message]}))
      setDraft(value=>value.trim()===content?'':value)
      queryClient.invalidateQueries({queryKey:key})
    } catch { setError('Chưa xác nhận tin nhắn đã gửi. Tải lại lịch sử để kiểm tra trước khi gửi lại.') }
    finally {sending.current=false;setPending(false)}
  }
  return <View style={styles.screen}>
    <View style={styles.header}><Pressable accessibilityLabel="Quay lại" onPress={()=>navigation.goBack()} style={styles.icon}><Ionicons name="arrow-back" size={21} color="#252525" /></Pressable><View style={styles.avatar}><Ionicons name="headset-outline" size={22} color={colors.primary} /></View><View style={{flex:1}}><Text style={styles.title}>Nhắn tin với nhân viên</Text><Text style={styles.subtitle}>{connected?'Kết nối trực tiếp · Nhân viên sẽ phản hồi tại đây':'Tin nhắn cập nhật khi có kết nối'}</Text></View></View>
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      {conversation.isPending ? <View style={styles.empty}><ActivityIndicator color={colors.primary}/><Text style={styles.subtitle}>Đang mở cuộc trò chuyện…</Text></View> : conversation.isError ? <View style={styles.empty}><Text style={styles.subtitle}>Chưa kết nối được với bộ phận hỗ trợ.</Text><Pressable accessibilityLabel="Thử kết nối chat lại" onPress={()=>conversation.refetch()} style={styles.retry}><Text style={{color:colors.primary}}>Thử lại</Text></Pressable></View> : <FlatList ref={list} data={rows} keyExtractor={item=>String(item.id)} contentContainerStyle={{padding:16,flexGrow:1}} onContentSizeChange={()=>list.current?.scrollToEnd({animated:false})}
        ListHeaderComponent={messages.isError?<Pressable onPress={()=>messages.refetch()}><Text style={styles.error}>Chưa tải được lịch sử. Chạm để tải lại.</Text></Pressable>:null}
        ListEmptyComponent={<View style={styles.empty}>{messages.isPending?<ActivityIndicator color={colors.primary}/>:<><Ionicons name="chatbubbles-outline" size={38} color={colors.primary}/><Text style={styles.title}>Chúng mình luôn lắng nghe</Text><Text style={styles.subtitle}>Gửi câu hỏi về đơn hàng hoặc trải nghiệm của bạn.</Text></>}</View>}
        renderItem={({item})=>{const mine=item.vai_tro_nguoi_gui==='CUSTOMER';return <View style={[styles.bubble,mine?styles.mine:styles.theirs]}>{!mine&&<Text style={styles.sender}>{item.ten_nguoi_gui||'Nhân viên'}</Text>}<Text style={[styles.content,mine&&{color:'#fff'}]}>{item.noi_dung}</Text><Text style={[styles.time,mine&&{color:'#ffffffb3'}]}>{item.ngay_tao?new Date(item.ngay_tao).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}):''}</Text></View>}} />}
      {!!error&&<View style={{padding:12}}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityLabel="Tải lại lịch sử chat" onPress={()=>messages.refetch()}><Text style={{color:colors.primary,marginTop:8}}>Tải lại lịch sử</Text></Pressable></View>}
      <View style={styles.inputRow}><TextInput accessibilityLabel="Tin nhắn cho nhân viên" placeholder="Nhắn điều bạn cần hỗ trợ…" value={draft} onChangeText={setDraft} maxLength={2000} multiline style={styles.input}/><Pressable accessibilityLabel="Gửi tin nhắn cho nhân viên" disabled={!draft.trim()||!id||pending} onPress={send} style={[styles.send,(!draft.trim()||!id||pending)&&{opacity:.45}]}>{pending?<ActivityIndicator size="small" color="#fff"/>:<Ionicons name="arrow-up" size={22} color="#fff"/>}</Pressable></View>
    </KeyboardAvoidingView>
  </View>
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#faf8f6'},header:{padding:12,backgroundColor:'#fff',borderBottomWidth:1,borderColor:'#eee',flexDirection:'row',gap:10,alignItems:'center'},icon:{padding:8},avatar:{backgroundColor:'#fff0ee',borderRadius:20,padding:10},title:{fontSize:15,fontWeight:'600',color:'#252525'},subtitle:{fontSize:11,lineHeight:17,color:'#7b756f',marginTop:4},empty:{flex:1,alignItems:'center',justifyContent:'center',padding:28,gap:12},bubble:{maxWidth:'85%',borderRadius:14,padding:12,marginBottom:12},mine:{alignSelf:'flex-end',backgroundColor:colors.primary,borderBottomRightRadius:3},theirs:{alignSelf:'flex-start',backgroundColor:'#fff',borderWidth:1,borderColor:'#ece8e3',borderBottomLeftRadius:3},content:{fontSize:14,lineHeight:21,color:'#262626'},sender:{fontSize:11,color:colors.primary,fontWeight:'600',marginBottom:5},time:{fontSize:9,color:'#999',textAlign:'right',marginTop:5},inputRow:{padding:12,backgroundColor:'#fff',flexDirection:'row',gap:8,alignItems:'flex-end',borderTopWidth:1,borderColor:'#eee'},input:{flex:1,minHeight:44,maxHeight:100,backgroundColor:'#f6f4f1',padding:12,borderRadius:20,fontSize:13,color:'#252525'},send:{width:42,height:42,backgroundColor:colors.primary,borderRadius:21,alignItems:'center',justifyContent:'center'},error:{fontSize:12,color:'#b22830',lineHeight:18},retry:{padding:12}})
