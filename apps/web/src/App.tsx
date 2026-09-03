import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Shell } from './components/Shell'
import { AppStateProvider } from './state/AppState'
import { Home } from './routes/Home'
import { Savings } from './routes/Savings'
import { Pay } from './routes/Pay'
import { CatchUp } from './routes/CatchUp'
import { Activity } from './routes/Activity'

function App() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="savings" element={<Savings />} />
            <Route path="pay" element={<Pay />} />
            <Route path="catch-up" element={<CatchUp />} />
            <Route path="activity" element={<Activity />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppStateProvider>
  )
}

export default App
