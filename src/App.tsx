import { useEffect } from 'react'
import styles from './App.module.css'
import { AchievementToast } from './components/AchievementToast/AchievementToast'
import { GraphView } from './components/GraphView/GraphView'
import { Hud } from './components/Hud/Hud'
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
        </div>
        <div className={styles.shopColumn}>
          <Shop />
        </div>
      </div>
      <AchievementToast />
    </main>
  )
}

export default App
