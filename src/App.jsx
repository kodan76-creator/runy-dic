import { useState, useMemo } from 'react'
import dictionary from './data/dictionary.json'
import './App.css'
import logo from './assets/run_r.png'

function App() {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredData = useMemo(() => {
    return dictionary.filter(item =>
      item.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.translation.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [searchTerm])

  return (
    <div className="container">
      {/* Логотип вверху слева */}
      <img 
        src="/images/run_r.png" 
        alt="Logo" 
        className="logo"
      />
      <img src={logo} alt="Logo" className="logo" />
      
      <h1>Мой Словарь</h1>
      <input 
        type="text" 
        placeholder="Поиск слова..." 
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="search-input"
      />
      <div className="results">
        {filteredData.length > 0 ? (
          filteredData.map(item => (
            <div key={item.id} className="card">
              <h3 className="word">{item.word}</h3>
              <p className="translation">{item.translation}</p>
              <small className="example">{item.example}</small>
            </div>
          ))
        ) : (
          <p>Ничего не найдено</p>
        )}
      </div>
    </div>
  )
}

export default App