import { Alert as NativeAlert } from 'react-native'
let handler
export function registerAlertHandler(next) { handler = next; return () => { if (handler === next) handler = null } }
export default { alert(title, message, buttons, options) {
  if (handler) handler({ title, message, buttons: buttons?.length ? buttons : [{ text: 'Đóng' }], options })
  else NativeAlert.alert(title, message, buttons, options)
} }
