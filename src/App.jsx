import { useState, useMemo } from 'react'
import dictionary from './data/dictionary.json'
import './App.css'

function App() {
  const [searchTerm, setSearchTerm] = useState('')

  // Логика поиска: фильтруем словарь при вводе
  const filteredData = useMemo(() => {
    return dictionary.filter(item =>
      item.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.translation.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [searchTerm])

  return (
    <div className="container">
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
              <h3>{item.word}</h3>
              <p>{item.translation}</p>
              <small>{item.example}</small>
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