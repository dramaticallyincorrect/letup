# FUNCTIONAL PROGRAMMING BASICS - COMPREHENSIVE STUDY MATERIAL

## 1. OVERVIEW

Functional programming (FP) is a programming paradigm that treats computation as the evaluation of mathematical functions, avoiding changing state and mutable data. It emphasizes the use of pure functions, immutability, and first-class functions. This approach contrasts with imperative programming, which focuses on describing how to perform tasks through step-by-step instructions.

### Why Functional Programming?
- **Predictability**: Pure functions always produce the same output for the same input
- **Concurrency**: Immutable data structures make concurrent programming safer
- **Testability**: Pure functions are easier to test
- **Modularity**: Functions compose naturally
- **Reduced Bugs**: Fewer side effects mean fewer hidden dependencies

---

## 2. KEY CONCEPTS

### 2.1 Pure Functions
A pure function is a function that:
- Returns the same output for the same input
- Has no side effects (doesn't modify external state)
- Depends only on its arguments

Example (Pure Function):
```javascript
const add = (a, b) => a + b;  // Always returns a + b
```

Example (Impure Function):
```javascript
let counter = 0;
const increment = () => ++counter;  // Depends on and modifies external state
```

### 2.2 Immutability
Data should not be changed after creation. Instead of modifying existing data, create new copies with desired changes.

Example:
```javascript
// Mutable approach (imperative)
const arr = [1, 2, 3];
arr.push(4);  // Modifies original

// Immutable approach (functional)
const arr = [1, 2, 3];
const newArr = [...arr, 4];  // Creates new array
```

### 2.3 First-Class Functions
Functions are treated as values - they can be:
- Assigned to variables
- Passed as arguments
- Returned from other functions

Example:
```javascript
const greet = (name) => `Hello, ${name}!`;
const sayHello = greet;  // Assign function to variable
console.log(sayHello("Alice"));  // Output: Hello, Alice!
```

### 2.4 Higher-Order Functions
Functions that take other functions as arguments or return functions.

Example:
```javascript
const map = (fn, arr) => arr.map(fn);
const square = (x) => x * x;
const result = map(square, [1, 2, 3]);  // [1, 4, 9]
```

### 2.5 Recursion
Looping without explicit loop constructs, using function calls instead.

Example:
```javascript
const factorial = (n) => n <= 1 ? 1 : n * factorial(n - 1);
console.log(factorial(5));  // 120
```

### 2.6 Function Composition
Combining simple functions to build more complex operations.

Example:
```javascript
const compose = (f, g) => (x) => f(g(x));
const addOne = (x) => x + 1;
const double = (x) => x * 2;
const addOneThenDouble = compose(double, addOne);
console.log(addOneThenDouble(5));  // (5 + 1) * 2 = 12
```

### 2.7 Currying
Transforming a function with multiple arguments into a sequence of functions each with a single argument.

Example:
```javascript
// Original function
const add = (a, b) => a + b;

// Curried version
const curriedAdd = (a) => (b) => a + b;
const add5 = curriedAdd(5);
console.log(add5(3));  // 8
```

### 2.8 Partial Application
Fixing some arguments of a function and returning a new function.

Example:
```javascript
const multiply = (a, b, c) => a * b * c;
const multiplyBy2 = (b, c) => multiply(2, b, c);
console.log(multiplyBy2(3, 4));  // 24
```

---

## 3. DETAILED EXPLANATIONS

### 3.1 Pure Functions Deep Dive

**Definition**: A pure function is deterministic and has no side effects.

**Characteristics**:
1. Deterministic: f(x) always equals f(x) for all x
2. No side effects: Doesn't modify external state, variables, or data structures
3. Transparent: Can be replaced by its return value without changing behavior

**Benefits**:
- Easy to test and reason about
- Enable compiler optimizations
- Facilitate parallel execution
- Make debugging easier

**Anti-patterns**:
```javascript
// Impure: Uses global variable
let globalVar = 0;
const impureFunc = (x) => x + globalVar;

// Impure: Makes network request
const fetchData = (id) => fetch(`/api/data/${id}`);

// Impure: Modifies argument
const addToArray = (arr, item) => {
  arr.push(item);  // Modifies original array
  return arr;
};
```

### 3.2 Immutability Deep Dive

**Core Principle**: Once data is created, it cannot be changed.

**Implementation Strategies**:
1. Use const for assignments
2. Use Object.freeze() for shallow immutability
3. Create new objects instead of modifying existing ones

Example:
```javascript
// Mutable approach
const person = { name: "John", age: 30 };
person.age = 31;  // Modifies original

// Immutable approach
const person = { name: "John", age: 30 };
const updatedPerson = { ...person, age: 31 };  // Creates new object
```

**Data Structure Patterns**:
- Spread operator: `{ ...obj, newProp: value }`
- Array methods: `map()`, `filter()`, `reduce()` (create new arrays)
- Persistent data structures: Use libraries like Immer.js

### 3.3 Function Composition and Piping

**Composition**: f ∘ g = f(g(x))
Applying functions from right to left.

**Pipe**: g → f = f(g(x))
Applying functions from left to right.

Example:
```javascript
const compose = (...fns) => (x) => fns.reduceRight((acc, fn) => fn(acc), x);
const pipe = (...fns) => (x) => fns.reduce((acc, fn) => fn(acc), x);

const addOne = (x) => x + 1;
const double = (x) => x * 2;
const square = (x) => x * x;

// Composition (right to left)
const composedFn = compose(square, double, addOne);
console.log(composedFn(3));  // ((3 + 1) * 2)^2 = 64

// Pipe (left to right)
const pipedFn = pipe(addOne, double, square);
console.log(pipedFn(3));  // ((3 + 1) * 2)^2 = 64
```

### 3.4 Monads and Functors (Advanced)

**Functor**: A type that implements a `map` method.
```javascript
class Box {
  constructor(value) {
    this.value = value;
  }
  map(fn) {
    return new Box(fn(this.value));
  }
}

const result = new Box(2)
  .map(x => x + 1)
  .map(x => x * 2)
  .value;  // 6
```

**Monad**: A functor that also implements `flatMap` (or `bind`).
```javascript
class Maybe {
  constructor(value) {
    this.value = value;
  }
  flatMap(fn) {
    return this.value === null ? this : fn(this.value);
  }
}

const divide = (a, b) => b === 0 ? new Maybe(null) : new Maybe(a / b);
const result = divide(10, 2).flatMap(x => divide(x, 2)).value;  // 2.5
```

---

## 4. IMPORTANT FORMULAS AND DEFINITIONS

### Function Application
f: A → B (function f takes type A and returns type B)

### Function Composition
(f ∘ g)(x) = f(g(x))

### Currying
curry: ((a, b) → c) → (a → (b → c))

### Reduction/Fold
fold: (a → b → a) → a → [b] → a
Example: `[1, 2, 3].reduce((acc, x) => acc + x, 0)` = 6

### Map
map: (a → b) → [a] → [b]
Example: `[1, 2, 3].map(x => x * 2)` = [2, 4, 6]

### Filter
filter: (a → Boolean) → [a] → [a]
Example: `[1, 2, 3, 4].filter(x => x > 2)` = [3, 4]

---

## 5. PRACTICAL EXAMPLES

### Example 1: Building a Data Processing Pipeline
```javascript
const compose = (...fns) => (x) => fns.reduceRight((acc, fn) => fn(acc), x);

const data = [
  { name: "Alice", age: 25, salary: 50000 },
  { name: "Bob", age: 30, salary: 60000 },
  { name: "Charlie", age: 28, salary: 55000 }
];

const filterByAge = (minAge) => (people) => 
  people.filter(p => p.age >= minAge);

const mapToNames = (people) => 
  people.map(p => p.name);

const processEmployees = (minAge) => 
  compose(mapToNames, filterByAge(minAge));

const result = processEmployees(27)(data);
// Output: ["Bob", "Charlie"]
```

### Example 2: Error Handling with Either Monad
```javascript
class Either {
  constructor(value, isRight = true) {
    this.value = value;
    this.isRight = isRight;
  }
  
  static right(value) {
    return new Either(value, true);
  }
  
  static left(error) {
    return new Either(error, false);
  }
  
  map(fn) {
    return this.isRight ? Either.right(fn(this.value)) : this;
  }
  
  flatMap(fn) {
    return this.isRight ? fn(this.value) : this;
  }
}

const safeDivide = (a, b) => 
  b === 0 ? Either.left("Division by zero") : Either.right(a / b);

const result = safeDivide(10, 2)
  .flatMap(x => safeDivide(x, 2))
  .value;  // 2.5
```

### Example 3: Memoization (Performance Optimization)
```javascript
const memoize = (fn) => {
  const cache = {};
  return (...args) => {
    const key = JSON.stringify(args);
    if (key in cache) {
      return cache[key];
    }
    const result = fn(...args);
    cache[key] = result;
    return result;
  };
};

const fibonacci = memoize((n) => 
  n <= 1 ? n : fibonacci(n - 1) + fibonacci(n - 2)
);

console.log(fibonacci(40));  // Computed efficiently with memoization
```

---

## 6. ADVANTAGES AND DISADVANTAGES

### Advantages
- **Reliability**: Pure functions are predictable
- **Parallelization**: Immutability enables safe parallelism
- **Testing**: Easier unit testing of pure functions
- **Debugging**: Less state to track
- **Reusability**: Functions compose well

### Disadvantages
- **Learning Curve**: Different mindset from imperative programming
- **Performance Overhead**: Immutability can use more memory
- **Verbosity**: May require more code than imperative solutions
- **IO Operations**: Real-world applications need side effects
- **Debugging Recursion**: Stack traces can be confusing with deep recursion

---

## 7. FUNCTIONAL PROGRAMMING LANGUAGES

- **Haskell**: Pure functional language
- **Lisp/Scheme**: Historical functional programming
- **Clojure**: Functional language on JVM
- **Erlang**: Concurrent functional language
- **Scala**: Hybrid functional-object oriented
- **F#**: Functional-first on .NET
- **JavaScript/TypeScript**: Multi-paradigm with strong FP support
- **Python**: Multi-paradigm with FP features (map, filter, lambda)
- **Rust**: Modern language with FP features

---

## 8. KEY TAKEAWAYS

1. **Pure Functions** are the foundation of functional programming
2. **Immutability** prevents unexpected state changes
3. **Function Composition** creates reusable, testable code
4. **Higher-Order Functions** enable abstraction and code reuse
5. **Recursion** replaces loops in functional programming
6. **Currying and Partial Application** create flexible function variants
7. **Functors and Monads** provide powerful abstraction patterns
8. Functional programming doesn't require a pure FP language—even imperative languages support FP principles

---

## 9. PRACTICE EXERCISES

1. Write a pure function that calculates the sum of squares of an array
2. Implement a curry function that works with any number of arguments
3. Create a compose function and use it with 3+ functions
4. Implement map, filter, and reduce from scratch
5. Build an Either monad for error handling
6. Create a function that memoizes expensive calculations
7. Write a recursive function to flatten a nested array
8. Implement function pipeline for data transformation

---

## 10. RECOMMENDED RESOURCES

- "Composing Software" by Eric Elliott
- "Functional Programming in JavaScript" by Luis Atencio
- "Structure and Interpretation of Computer Programs" (SICP)
- Haskell documentation and tutorials
- Functional programming courses on major platforms
- Lodash/FP and Ramda.js libraries for JavaScript
