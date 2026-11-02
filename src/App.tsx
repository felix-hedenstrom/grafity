import { useEffect } from 'react'
import styles from './App.module.css'
import { AchievementToast } from './components/AchievementToast/AchievementToast'
import { ResetButton } from './components/Controls/ResetButton'
import { GraphView } from './components/GraphView/GraphView'
import { Hud } from './components/Hud/Hud'
import { Shop } from './components/Shop/Shop'
import { startGame } from './game'

function App() {
  useEffect(() => {
    const handle = startGame()
    return () => handle.stop()
  }, [])

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
      <ResetButton />
      <AchievementToast />
    </main>
  )
}

export default App
