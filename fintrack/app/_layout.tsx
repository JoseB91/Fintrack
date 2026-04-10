import { useFonts } from 'expo-font'
import { Stack, router } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useState } from 'react'
import 'react-native-reanimated'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  })
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    if (fontError) throw fontError
  }, [fontError])

  // Obtener sesión inicial
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Redirigir cuando tengamos sesión y fuentes cargadas
  useEffect(() => {
    if (!loaded || session === undefined) return

    SplashScreen.hideAsync()

    if (session) {
      router.replace('/(tabs)')
    } else {
      router.replace('/(auth)/login')
    }
  }, [loaded, session])

  if (!loaded || session === undefined) {
    return null
  }

  return (
    <Stack>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      <Stack.Screen
        name="transaction/add"
        options={{ presentation: 'modal', title: 'Nuevo Gasto' }}
      />
      <Stack.Screen
        name="transaction/[id]"
        options={{ presentation: 'modal', title: 'Detalle' }}
      />
    </Stack>
  )
}
