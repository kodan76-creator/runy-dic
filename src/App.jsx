import { useState, useMemo, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from './firebase'
import AdminPanel from './AdminPanel'
import './App.css'

function Home() {
  const [searchTerm, setSearchTerm] = useState('')
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadWords = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'dictionary'))
        const wordsList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setWords(wordsList)
      } catch (err) {
        console.error('Ошибка загрузки:', err)
      }
      setLoading(false)
    }
    
    loadWords()
  }, [])

  const filteredData = useMemo(() => {
    return words.filter(item =>
      item.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.translation.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [searchTerm, words])

  if (loading) {
    return (
      <div className="container">
        <div className="header">
          <img 
            src="https://kodan76-creator.github.io/runy-dic/run_r.png" 
            alt="Logo" 
            className="logo"
            width="130"
            height="119"
          />
          <input 
            type="text" 
            placeholder="Поиск слова..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="loading">Загрузка словаря...</div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="header">
        <img 
          src="https://kodan76-creator.github.io/runy-dic/run_r.png" 
          alt="Logo" 
          className="logo"
          width="130"
          height="119"
        />
        <input 
          type="text" 
          placeholder="Поиск слова..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>
      
      <div className="results">
        {filteredData.length > 0 ? (
          filteredData.map(item => (
            <div key={item.id} className="card">
              <h3 className="word">{item.word}</h3>
              <p className="translation">{item.translation}</p>
              <div className="examples">
                <span className="example">{item.example}</span>
                {item.example2 && (
                  <>
                    <span className="dash"> — </span>
                    <span className="example2">{item.example2}</span>
                  </>
                )}
              </div>
            </div>
          ))
        ) : (
          <p>Ничего не найдено</p>
        )}
      </div>
    </div>
  )
}

function App() {
  return (
    <Router basename="/runy-dic">  {/* ← ДОБАВЛЕНО basename */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </Router>
  )
}

export default App