import { Routes, Route } from 'react-router'
import Game from './components/Game.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Game />} />
    </Routes>
  )
}
