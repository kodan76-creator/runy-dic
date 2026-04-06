import { useState, useMemo } from 'react'
import dictionary from './data/dictionary.json'
import './App.css'

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
      {/* Верхняя часть: логотип + поиск по центру */}
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
      
      {/* Карточки слов */}
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

export default App