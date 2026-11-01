import { useEffect } from 'react'
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
      <GraphView />
      <Shop />
      <ResetButton />
    </main>
  )
}

export default App
