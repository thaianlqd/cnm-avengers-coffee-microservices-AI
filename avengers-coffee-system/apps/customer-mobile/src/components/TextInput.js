import React, { forwardRef } from 'react'
import { Platform, TextInput as NativeInput } from 'react-native'

// One focus indicator on the enclosing field; browser/extension decorations must not create a second box.
export default forwardRef(function TextInput(props, ref) {
  const web = Platform.OS === 'web' ? {
    'data-gramm': 'false', 'data-gramm_editor': 'false', 'data-enable-grammarly': 'false',
    spellCheck: false, dataSet: { ...props.dataSet, 'customer-input': 'true', gramm: 'false', gramm_editor: 'false', 'enable-grammarly': 'false' },
  } : {}
  return <NativeInput {...props} {...web} ref={ref} style={[props.style, Platform.OS === 'web' && { outlineStyle: 'none' }]} />
})
