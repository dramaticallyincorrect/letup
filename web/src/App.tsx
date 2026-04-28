import './App.css'
import { Board } from './board/board'
function App() {

  return (
    <Board data={{
      name: 'Programming',
      columns: [
        {
          name: 'Subjects',
          pipeline: [],
          cards: [
            {
              title: 'Functional Programming',
              description: 'Fundamentals of functional programming, examples using JavaScript',
              data: null,
            },
            {
              title: 'Intro to TypeScript',
              description: 'Types, generics, and utility types',
              data: null,
            },
          ]
        },
        {
          name: 'Studying',
          pipeline: [],
          cards: [
            {
              title: 'Object Oriented Programming',
              description: 'Fundamentals of OOP, examples using JavaScript',
              data: null,
            },
            {
              title: 'React Hooks Deep Dive',
              description: 'useState, useEffect, useCallback, useMemo',
              data: null,
            },
          ]
        },
        {
          name: 'Practice',
          pipeline: [],
          cards: [
            {
              title: 'Async & Promises',
              description: 'Event loop, promises, async/await patterns',
              data: null,
            },
          ]
        },
        {
          name: 'Completed',
          pipeline: [],
          cards: [
            {
              title: 'HTML & CSS Basics',
              description: 'Box model, flexbox, grid',
              data: null,
            },
          ]
        },
      ]
    }} />
  )
}

export default App
