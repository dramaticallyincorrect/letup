import './App.css'
import { Board } from './board/board'
function App() {

  return (
    <Board data={{
      name: 'Programming',
      columns: [
        {

          id: '0',
          name: 'Subjects',
          pipeline: [],
          cards: [
            {
              id: '0',
              title: 'Functional Programming',
              description: 'Fundamentals of functional programming, examples using JavaScript',
              data: null,
            },
            {
              id: '1',
              title: 'Intro to TypeScript',
              description: 'Types, generics, and utility types',
              data: null,
            },
          ]
        },
        {
          id: '1',
          name: 'Studying',
          pipeline: [],
          cards: [
            {
              id: '2',
              title: 'Object Oriented Programming',
              description: 'Fundamentals of OOP, examples using JavaScript',
              data: null,
            },
            {
              id: '3',
              title: 'React Hooks Deep Dive',
              description: 'useState, useEffect, useCallback, useMemo',
              data: null,
            },
          ]
        },
        {
          id: '2',
          name: 'Practice',
          pipeline: [],
          cards: [
            {
              id: '4',
              title: 'Async & Promises',
              description: 'Event loop, promises, async/await patterns',
              data: null,
            },
          ]
        },
        {
          id: '3',
          name: 'Completed',
          pipeline: [],
          cards: [
            {
              id: '5',
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
