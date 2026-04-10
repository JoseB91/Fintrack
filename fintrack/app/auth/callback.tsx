import { useEffect } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import * as WebBrowser from 'expo-web-browser'

// Esta pantalla existe para que expo-web-browser pueda cerrar el browser
// al volver desde el OAuth redirect. La sesión la maneja login.tsx.
export default function AuthCallbackScreen() {
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession()
  }, [])

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#007AFF" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
})
