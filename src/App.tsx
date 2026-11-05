import { useEffect } from 'react'
import styles from './App.module.css'
import { AchievementToast } from './components/AchievementToast/AchievementToast'
import { GraphView } from './components/GraphView/GraphView'
import { GreetingToast } from './components/GreetingToast/GreetingToast'
import { Hud } from './components/Hud/Hud'
import { OptionsModal } from './components/OptionsModal/OptionsModal'
import { PrestigeShopModal } from './components/PrestigeShopModal/PrestigeShopModal'
import { ScannerArrayModal } from './components/ScannerArrayModal/ScannerArrayModal'
import { ScannerPanel } from './components/ScannerArrayModal/ScannerPanel'
import { Shop } from './components/Shop/Shop'
import { startGame } from './game'
import { useProgressionStore } from './store/useProgressionStore'

function App() {
  const themeMode = useProgressionStore((s) => s.themeMode)

  useEffect(() => {
    const handle = startGame()
    return () => handle.stop()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode
  }, [themeMode])

  return (
    <main>
      <h1>Grafity</h1>
      <Hud />
      <div className={styles.layout}>
        <div className={styles.graphColumn}>
          <GraphView />
          <ScannerPanel />
        </div>
        <div className={styles.shopColumn}>
          <Shop />
        </div>
      </div>
      <AchievementToast />
      <GreetingToast />
      <OptionsModal />
      <PrestigeShopModal />
      <ScannerArrayModal />
    </main>
  )
}

export default App
