import { useState } from 'react'
import TopBar from './components/TopBar'
import FileTree from './components/FileTree'
import Editor from './components/Editor'
import Sidebar from './components/Sidebar'
import OutputPanel from './components/OutputPanel'

export default function App() {
  const [language, setLanguage] = useState('javascript')

  return (
    <div className="flex flex-col h-full w-full">
      <TopBar language={language} onLanguageChange={setLanguage} />

      <div className="flex flex-1 overflow-hidden">
        <FileTree />

        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <Editor language={language} />
          </div>
          <OutputPanel />
        </div>

        <Sidebar />
      </div>
    </div>
  )
}
