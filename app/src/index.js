const express = require('express')
const session = require('express-session')
const path = require('path')
const bodyParser = require('body-parser')
const sqlite3 = require('sqlite3')
const fs = require('fs')

const db = new sqlite3.Database('scrap.db')
db.serialize(() => {
  db.get('select count(*) from sqlite_master', (err, res) => {
    if (res['count(*)'] == 0) {
      db.run('create table users (id integer primary key, name text unique, password text)')
    }
  })
})

const app = express()

app.use(bodyParser.urlencoded({
  extended: false
}))
app.use(session({
  secret: 'XXXSECRETVALUE',
  resave: false,
  saveUninitialized: false
}))

// set CSP to prevent XSS
app.use((req, res, next) => {
  res.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'")
  next()
})

// serve static files
const staticBaseUri = '/static'
const staticDir = path.join(__dirname, '..', 'static')
const rawStaticDir = path.join(staticDir, 'raw')
app.use(staticBaseUri, express.static(staticDir))

// see how to use pug http://expressjs.com/ja/guide/using-template-engines.html
app.set('view engine', 'pug')
app.use((req, res, next) => {
  res.locals.staticBaseUri = staticBaseUri
  res.locals.session = req.session
  next()
})

app.get('/login', (req, res) => res.render('login'))
app.post('/login', (req, res) => {
  db.serialize(() => {
    db.get(
      'select id, name from users where name = ? AND password = ?',
      req.body.name, req.body.password,
      (err, user) => {
        req.session.user = user
        res.redirect('/')
      }
    )
  })
})
app.get('/register', (req, res) => res.render('register'))
app.post('/register', (req, res) => {
  const errors = []
  if (req.body.name.length > 60) {
    errors.push('Username should be less than 60')
  }
  if (errors.length > 0) {
    return res.render('register', { errors })
  }

  db.run(
    'insert into users (name, password) values (?, ?)',
    req.body.name, req.body.password,
    function (err, user) {
      const dirname = path.join(rawStaticDir, this.lastID.toString())
      fs.mkdirSync(dirname)

      res.redirect('/')
    }
  )
})

// require login below
app.use((req, res, next) => {
  if (!req.session.user || !req.session.user.id) {
    return res.redirect('/login')
  }
  next()
})

app.get('/', (req, res) => {
  const scrapsDir = path.join(rawStaticDir, req.session.user.id.toString())
  fs.readdir(scrapsDir, (err, files) => {
    if (err) {
      files = []
    }
    res.render('index', { files })
  })
})

app.get('/logout', (req, res) => {
  req.session.user = null
  res.redirect('/')
})

app.get('/new', (req, res) => res.render('new'))
app.post('/new', (req, res) => {
  // check body
  const errors = []
  if (req.body.title.length > 30) {
    errors.push('Title length should be less than 30')
  }
  if (/[^0-9a-zA-Z '.]/.test(req.body.title)) {
    errors.push('You cannot use unsafe character')
  }
  if (/[^0-9a-zA-Z '.\n/]/.test(req.body.body)) {
    errors.push('You cannot use unsafe character')
  }
  if (errors.length > 0) {
    return res.render('/new', { errors })
  }

  const filename = path.join(rawStaticDir, req.session.user.id.toString(), req.body.title)
  fs.writeFileSync(filename, req.body.body)
  res.redirect(`/scraps/${req.session.user.id}/${req.body.title}`)
})

app.get('/scraps/:user_id/:title', (req, res) => {
  // admin and owner can view scrap
  db.serialize(() => {
    db.get('select * from users where id = ?', req.params.user_id, (err, user) => {
      res.render('scrap', { user, title: req.params.title })
    })
  })
})

app.listen(3000)
