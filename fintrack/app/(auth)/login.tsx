import { useState } from 'react'
import { StyleSheet, View, Text, Pressable, ActivityIndicator } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { supabase } from '@/lib/supabase'

WebBrowser.maybeCompleteAuthSession()

export default function LoginScreen() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGoogleLogin() {
    setLoading(true)
    setError(null)

    try {
      const redirectTo = Linking.createURL('/auth/callback')
      console.log('redirectTo:', redirectTo)

      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes: 'email https://www.googleapis.com/auth/gmail.readonly',
          redirectTo,
          skipBrowserRedirect: true,
        },
      })

      if (authError) throw authError
      if (!data.url) throw new Error('No se obtuvo URL de autenticación')
      console.log('OAuth URL:', data.url)

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
      console.log('result type:', result.type)
      if (result.type === 'success') console.log('result url:', result.url)

      if (result.type === 'success') {
        const url = new URL(result.url)
        const accessToken = url.searchParams.get('access_token')
        const refreshToken = url.searchParams.get('refresh_token')

        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        } else {
          // Supabase a veces pone los tokens en el hash (#)
          const hash = url.hash.slice(1)
          const params = new URLSearchParams(hash)
          const hashAccess = params.get('access_token')
          const hashRefresh = params.get('refresh_token')

          if (hashAccess && hashRefresh) {
            await supabase.auth.setSession({ access_token: hashAccess, refresh_token: hashRefresh })
          }
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Fintrack</Text>
        <Text style={styles.subtitle}>Controla tus gastos automáticamente</Text>
      </View>

      <View style={styles.footer}>
        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={handleGoogleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Conectar con Gmail</Text>
          )}
        </Pressable>

        <Text style={styles.disclaimer}>
          Solo se solicita acceso de lectura a tus correos de notificaciones bancarias.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 64,
  },
  header: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 18,
    color: '#555',
    textAlign: 'center',
  },
  footer: {
    gap: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    textAlign: 'center',
  },
  disclaimer: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
})
