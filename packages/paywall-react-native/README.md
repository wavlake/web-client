# @wavlake/paywall-react-native

React Native hooks and providers for Wavlake paywall integration.

## Installation

```bash
npm install @wavlake/paywall-react-native @react-native-async-storage/async-storage
```

## Quick Start

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  createWallet,
  WalletProvider, 
  PaywallProvider, 
  PaywallClient,
  useWallet, 
  useTrackPlayer,
} from '@wavlake/paywall-react-native';

// Create wallet with AsyncStorage
const wallet = createWallet({
  mintUrl: 'https://mint.wavlake.com',
  storageKey: 'my-wallet',
  asyncStorage: AsyncStorage,
});

const client = new PaywallClient({
  apiUrl: 'https://api.wavlake.com',
});

// Wrap your app with providers
function App() {
  return (
    <WalletProvider wallet={wallet}>
      <PaywallProvider client={client}>
        <Player />
      </PaywallProvider>
    </WalletProvider>
  );
}

// Use hooks in components
function Player() {
  const { balance, isReady } = useWallet();
  const { play, audioUrl, isPlaying, isLoading, error } = useTrackPlayer();

  if (!isReady) return <Text>Loading wallet...</Text>;

  return (
    <View>
      <Text>Balance: {balance} credits</Text>
      {error && <Text style={{ color: 'red' }}>{error.message}</Text>}
      
      <Button 
        title={isPlaying ? 'Playing...' : 'Play (1 credit)'}
        onPress={() => play('track-dtag-here', 1)} 
        disabled={isLoading || balance < 1}
      />
      
      {/* Use react-native-video or expo-av with audioUrl */}
    </View>
  );
}
```

## Helper Functions

### createWallet

Creates a wallet pre-configured with AsyncStorage:

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createWallet } from '@wavlake/paywall-react-native';

const wallet = createWallet({
  mintUrl: 'https://mint.wavlake.com',
  storageKey: 'my-app-wallet',  // Key used in AsyncStorage
  asyncStorage: AsyncStorage,
  walletConfig: {
    // Additional wallet options...
  },
});
```

## Re-exports

This package re-exports everything from:
- `@wavlake/paywall-react` - Hooks and providers
- `@wavlake/wallet` - Wallet class and storage adapters
- `@wavlake/paywall-client` - API client

You don't need to install these packages separately.

## Audio Playback

This package handles the paywall and wallet logic. For audio playback, use:

- [react-native-video](https://github.com/react-native-video/react-native-video)
- [expo-av](https://docs.expo.dev/versions/latest/sdk/av/)

Example with expo-av:

```tsx
import { Audio } from 'expo-av';
import { useTrackPlayer } from '@wavlake/paywall-react-native';

function Player() {
  const { play, audioUrl, isPlaying } = useTrackPlayer();
  const soundRef = useRef<Audio.Sound>();

  useEffect(() => {
    if (audioUrl) {
      Audio.Sound.createAsync({ uri: audioUrl })
        .then(({ sound }) => {
          soundRef.current = sound;
          sound.playAsync();
        });
    }
    
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, [audioUrl]);

  return (
    <Button
      title={isPlaying ? 'Playing' : 'Play'}
      onPress={() => play('track-dtag', 1)}
    />
  );
}
```

## Expo Support

Works with Expo projects. Just install the peer dependencies:

```bash
npx expo install @react-native-async-storage/async-storage
npm install @wavlake/paywall-react-native
```

## TypeScript

Full TypeScript support included.

## License

MIT
