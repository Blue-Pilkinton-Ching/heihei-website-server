import {
  AdminDashboard,
  Game,
  GameListItem,
  GamesList,
  User,
  UserPrivilege,
  UserTypes,
} from '../../types'
import * as admin from 'firebase-admin'
import privilege from './../authenticate'
import { Router } from 'express'

import { multer } from './../server'

import {
  deleteFolder,
  overriteFile,
  overriteFolder,
  uploadFile,
  uploadFolder,
} from '../util/s3'
import AdmZip from 'adm-zip'

import * as fs from 'fs'
import path from 'path'

export const dashboard = Router()
dashboard.use(privilege)

// Route

dashboard.get('/', async (req, res) => {
  const privilege = req.headers['privilege'] as UserPrivilege
  let body: AdminDashboard | {} = {}
  let statusCode = 500
  if (privilege === 'admin' || privilege === 'privileged') {
    let users
    let gameslist
    let authRequests
    let partners
    try {
      const func1 = async () => {
        const d = (
          await admin.firestore().doc('gameslist/BrHoO8yuD3JdDFo8F2BC').get()
        ).data() as GamesList
        gameslist = d.data
        partners = d.partners
      }
      const func2 = async () =>
        (authRequests = (
          await admin
            .firestore()
            .collection('users/privileged/requests')
            .limit(100)
            .get()
        ).docs.map((doc) => doc.data()) as User[])
      const func3 = async () =>
        (users = (
          await admin.firestore().doc('users/privileged').get()
        ).data() as UserTypes)

      if (privilege === 'admin') {
        await Promise.allSettled([func1(), func2(), func3()])
      } else {
        await Promise.allSettled([func1(), func3()])
      }

      statusCode = 200
    } catch (error) {
      console.error(error)
      statusCode = 500
    }
    if (privilege === 'admin') {
      body = { users, gameslist, authRequests, partners }
    } else {
      body = { gameslist, users }
    }
  } else {
    statusCode = 401
  }
  return res.setHeader('privilege', privilege).status(statusCode).json(body)
})

// Users

dashboard.post('/users', async (req, res) => {
  const privilege = req.headers['privilege'] as UserPrivilege

  const reqBody = (await JSON.parse(req.body)) as { user: User }

  let statusCode = 500

  if (privilege === 'admin') {
    try {
      const func1 = async () => {
        const d = (
          await admin.firestore().doc('users/privileged').get()
        ).data() as UserTypes

        d.privileged.push(reqBody.user)

        await admin.firestore().doc('users/privileged').set(d)

        await (
          await admin
            .firestore()
            .collection('users/privileged/requests')
            .limit(1)
            .where('uid', '==', reqBody.user.uid)
            .get()
        ).docs[0].ref.delete()
      }

      func1()

      statusCode = 200
    } catch (error) {
      console.error(error)
      statusCode = 500
    }
  } else {
    statusCode = 401
  }

  res.status(statusCode).json({})
})

dashboard.delete('/users', async (req, res) => {
  const privilege = req.headers['privilege'] as UserPrivilege

  const reqBody = (await JSON.parse(req.body)) as { user: User }

  let statusCode = 500

  if (privilege === 'admin') {
    try {
      const func1 = async () => {
        const d = (
          await admin.firestore().doc('users/privileged').get()
        ).data() as UserTypes

        d.privileged = d.privileged.filter((x) => x.uid !== reqBody.user.uid)

        await admin.firestore().doc('users/privileged').set(d)
      }

      func1()

      statusCode = 200
    } catch (error) {
      console.error(error)
      statusCode = 500
    }
  } else {
    statusCode = 401
  }

  res.status(statusCode).json({})
})

dashboard.get('/users', async (req, res) => {
  const privilege = req.headers['privilege'] as UserPrivilege

  let statusCode = 500

  let body = {}

  if (privilege === 'admin' || privilege === 'privileged') {
    try {
      const users = (
        await admin.firestore().doc('users/privileged').get()
      ).data() as UserTypes

      body = users

      statusCode = 200
    } catch (error) {
      console.error(error)
      statusCode = 500
    }
  } else {
    statusCode = 401
  }

  res.status(statusCode).json(body)
})

// Requests

dashboard.delete('/requests', async (req, res) => {
  const privilege = req.headers['privilege'] as UserPrivilege
  const reqBody = (await JSON.parse(req.body)) as { user: User }
  let statusCode = 500
  if (privilege === 'admin') {
    try {
      const updateData = async () => {
        const query = admin
          .firestore()
          .collection('users/privileged/requests')
          .limit(1)
          .where('uid', '==', reqBody.user.uid)
        await (await query.get()).docs[0].ref.delete()
      }
      await updateData()
      statusCode = 200
    } catch (error) {
      console.error(error)
      statusCode = 500
    }
  } else {
    statusCode = 401
  }
  res.status(statusCode).json({})
})

// Partners

dashboard.post('/partners', async (req, res) => {
  const privilege = req.headers['privilege'] as UserPrivilege

  const reqBody = await JSON.parse(req.body)

  let statusCode = 500

  if (privilege === 'admin') {
    try {
      const updateData = async () => {
        const query = admin.firestore().collection('gameslist').limit(1)

        const doc = (await query.get()).docs[0]
        const data = doc.data() as GamesList

        data.partners.push({ name: reqBody, hidden: false })

        await doc.ref.set(data)
      }

      await updateData()

      statusCode = 200
    } catch (error) {
      console.error(error)
      statusCode = 500
    }
  } else {
    statusCode = 401
  }

  res.status(statusCode).json({})
})

dashboard.patch('/partners/:partner', async (req, res) => {
  const privilege = req.headers['privilege'] as UserPrivilege

  const reqBody = await JSON.parse(req.body)

  console.log(req.params.partner)

  let statusCode = 500

  if (privilege === 'admin') {
    try {
      Promise.allSettled([
        (async () => {
          const query = admin.firestore().collection('gameslist').limit(1)

          const doc = (await query.get()).docs[0]
          const data = doc.data() as GamesList

          let index = data.partners.findIndex(
            (item) => item.name === req.params.partner
          )

          if (index === -1) {
            throw new Error(`Invalid Partner ${index}`)
          }

          data.data = data.data.map((element) => {
            if (element.partner === req.params.partner) {
              return { ...element, partner: reqBody.partner }
            } else {
              return { ...element }
            }
          }) as GameListItem[]

          data.partners[index].name = reqBody.partner

          const query2 = admin
            .firestore()
            .collection('games')
            .where('partner', '==', req.params.partner)
            .limit(100)

          Promise.allSettled([
            (async () => {
              await doc.ref.set(data)
            })(),
            async () => {
              const docs = (await query2.get()).docs

              Promise.allSettled(
                docs.map((element) => {
                  return async () =>
                    element.ref.update({ partner: reqBody.partner })
                })
              )
            },
          ])
        })(),
      ])

      statusCode = 200
    } catch (error) {
      console.error(error)
      statusCode = 500
    }
  } else {
    statusCode = 401
  }

  res.status(statusCode).json({})
})

dashboard.delete('/partners', async (req, res) => {
  const privilege = req.headers['privilege'] as UserPrivilege

  const reqBody = await JSON.parse(req.body)

  let statusCode = 500

  if (privilege === 'admin') {
    try {
      const updateData = async () => {
        const query = admin.firestore().collection('gameslist').limit(1)

        const doc = (await query.get()).docs[0]
        const data = doc.data() as GamesList

        data.partners = data.partners.filter((item) => item.name !== reqBody)

        await doc.ref.set(data)
      }

      await updateData()

      statusCode = 200
    } catch (error) {
      console.error(error)
      statusCode = 500
    }
  } else {
    statusCode = 401
  }

  res.status(statusCode).json({})
})

dashboard.patch('/partners/visibility', async (req, res) => {
  const privilege = req.headers['privilege'] as UserPrivilege

  const reqBody = await JSON.parse(req.body)

  let statusCode = 500

  if (privilege === 'admin') {
    try {
      const updateData = async () => {
        const query = admin.firestore().collection('gameslist').limit(1)

        const doc = (await query.get()).docs[0]
        const data = doc.data() as GamesList

        data.partners[
          data.partners.findIndex((item) => item.name === reqBody.name)
        ].hidden = reqBody.hidden

        await doc.ref.set(data)
      }

      await updateData()

      statusCode = 200
    } catch (error) {
      console.error(error)
      statusCode = 500
    }
  } else {
    statusCode = 401
  }

  res.status(statusCode).json({})
})

// Games

dashboard.post(
  '/add',
  multer.fields([
    { name: 'game', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
  ]),
  async (req, res) => {
    const privilege = req.headers['privilege'] as UserPrivilege

    const game = JSON.parse(req.body.data) as Game

    let statusCode = 500

    const files = req.files as {
      thumbnail: Express.Multer.File[]
      game: Express.Multer.File[] | undefined
      banner: Express.Multer.File[] | undefined
    }

    if (files.thumbnail == undefined) {
      res.status(400).json({ error: 'No thumbnail provided' })
      return
    }

    if (privilege === 'admin' || privilege === 'privileged') {
      const latestID = (
        await admin.firestore().doc('gameslist/latest-id').get()
      ).data() as { id: number }

      latestID.id += 1

      try {
        await admin
          .firestore()
          .doc('gameslist/latest-id')
          .set({ id: latestID.id })
      } catch (error) {
        console.error(error)
        res.status(500).json({})
      }

      const id = latestID.id

      console.log(`Adding ${id}...`)

      try {
        await Promise.all([
          (async () => {
            await uploadFile(
              `${process.env.AWS_BUCKET}`,
              `${id}/thumbnail.png`,
              files.thumbnail[0].path
            )
          })(),

          (async () => {
            if (files.banner) {
              await uploadFile(
                `${process.env.AWS_BUCKET}`,
                `${id}/banner.png`,
                files.banner[0].path
              )
            }
          })(),

          (async () => {
            if (files.game) {
              var zip = new AdmZip(files.game[0].path)

              zip.extractAllTo(`tmp/${id}/game`, true)

              await uploadFolder(
                `${process.env.AWS_BUCKET}`,
                `tmp/${id}/game/`,
                `${id}/game/`
              )
            }
          })(),

          (async () => {
            const d = (
              await admin
                .firestore()
                .doc('gameslist/BrHoO8yuD3JdDFo8F2BC')
                .get()
            ).data() as GamesList

            d.data.push({
              app: game.displayAppBadge,
              id,
              hidden: false,
              exclude: game.exclude || '',
              name: game.name,
              partner: game.partner,
              thumbnail: `https://${process.env.AWS_BUCKET}.syd1.cdn.digitaloceanspaces.com/heihei-bucket/${id}/thumbnail.png`,
              featured: false,
              ...(files.banner && {
                banner: `https://${process.env.AWS_BUCKET}.syd1.cdn.digitaloceanspaces.com/heihei-bucket/${id}/banner.png`,
              }),
              educational: game.educational || false,
              approved: false,
              sort: id * 100,
              timestamp: Date.now(),
              playableOnHeihei: game.playableOnHeihei,
            })

            await admin.firestore().doc(`gameslist/BrHoO8yuD3JdDFo8F2BC`).set(d)
          })(),
          (async () => {
            await admin
              .firestore()
              .doc(`games/${id}`)
              .set({
                ...game,
                id: id,
                createdAt: Date.now(),
                ...(files.game
                  ? {
                      url: `https://${process.env.AWS_BUCKET}.syd1.cdn.digitaloceanspaces.com/heihei-bucket/${id}/game/index.html`,
                      isGameExternal: false,
                    }
                  : {
                      url: game.url,
                      isGameExternal: true,
                    }),
                thumbnail: `https://${process.env.AWS_BUCKET}.syd1.cdn.digitaloceanspaces.com/heihei-bucket/${id}/thumbnail.png`,
                ...(files.banner && {
                  screenshot: `https://${process.env.AWS_BUCKET}.syd1.cdn.digitaloceanspaces.com/heihei-bucket/${id}/banner.png`,
                }),
              })
          })(),
        ]).catch((error) => {
          console.error(error)
          throw error
        })

        statusCode = 200
      } catch (error) {
        console.error(error)
        statusCode = 500
      }

      fs.unlink(files.thumbnail[0].path, (err) => {
        if (err) throw err
      })
      if (files.game) {
        fs.unlink(files.game[0].path, (err) => {
          if (err) throw err
        })
        fs.rm(`tmp/${id}`, { recursive: true, force: true }, (err) => {
          if (err) throw err
        })
      }
      if (files.banner) {
        fs.unlink(files.banner[0].path, (err) => {
          if (err) throw err
        })
      }

      fs.readdir('uploads', (err, files) => {
        if (err) throw err
        for (const file of files) {
          fs.unlink(path.join('uploads', file), (err) => {
            if (err) throw err
          })
        }
      })
    } else {
      statusCode = 401
    }

    res.status(statusCode).json({})
  }
)

dashboard.patch(
  '/:gameID',
  multer.fields([
    { name: 'game', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
  ]),
  async (req, res) => {
    const privilege = req.headers['privilege'] as UserPrivilege

    const gameChanges = await JSON.parse(req.body.data)

    const files = req.files as {
      thumbnail: Express.Multer.File[] | undefined
      game: Express.Multer.File[] | undefined
      banner: Express.Multer.File[] | undefined
    }

    let statusCode = 500

    if (privilege === 'admin') {
      try {
        await Promise.allSettled([
          (async () => {
            await (
              await admin
                .firestore()
                .collection('games')
                .where('id', '==', Number(req.params.gameID))
                .limit(1)
                .get()
            ).docs[0].ref.update({
              ...gameChanges,
              updatedAt: Date.now(),
              ...(files.game
                ? {
                    url: `https://${process.env.AWS_BUCKET}.syd1.cdn.digitaloceanspaces.com/heihei-bucket/${req.params.gameID}/game/index.html`,
                    isGameExternal: false,
                  }
                : {
                    url: gameChanges.url,
                    isGameExternal: true,
                  }),
              ...(files.banner && {
                screenshot: `https://${process.env.AWS_BUCKET}.syd1.cdn.digitaloceanspaces.com/heihei-bucket/${req.params.gameID}/banner.png`,
              }),
            })
          })(),
          (async () => {
            const doc = (
              await admin.firestore().collection('gameslist').limit(1).get()
            ).docs[0]
            const data = doc.data() as { data: GameListItem[] }

            const item =
              data.data[
                data.data.findIndex(
                  (item) => item.id === Number(req.params.gameID)
                )
              ]

            item.name = gameChanges.name
            item.partner = gameChanges.partner
            item.exclude = gameChanges.exclude
            item.app = gameChanges.displayAppBadge
            item.educational = gameChanges.educational
            item.playableOnHeihei = gameChanges.playableOnHeihei

            if (files.thumbnail) {
              item.thumbnail = `https://${process.env.AWS_BUCKET}.syd1.cdn.digitaloceanspaces.com/heihei-bucket/${req.params.gameID}/thumbnail.png`
            }

            if (files.banner) {
              item.banner = `https://${process.env.AWS_BUCKET}.syd1.cdn.digitaloceanspaces.com/heihei-bucket/${req.params.gameID}/banner.png`
            }

            await doc.ref.set(data)
          })(),
          (async () => {
            if (files.thumbnail) {
              await overriteFile(
                `${process.env.AWS_BUCKET}`,
                files.thumbnail[0].path,
                `${req.params.gameID}/thumbnail.png`
              )
            }
          })(),

          (async () => {
            if (files.banner) {
              await overriteFile(
                `${process.env.AWS_BUCKET}`,
                files.banner[0].path,
                `${req.params.gameID}/banner.png`
              )
            }
          })(),

          (async () => {
            if (files.game) {
              var zip = new AdmZip(files.game[0].path)

              zip.extractAllTo(`tmp/${req.params.gameID}/game`, true)

              await overriteFolder(
                `${process.env.AWS_BUCKET}`,
                `tmp/${req.params.gameID}/game/`,
                `${req.params.gameID}/game/`
              )
            }
          })(),
        ])

        statusCode = 200
      } catch (error) {
        console.error(error)
        statusCode = 500
      }

      if (files.thumbnail) {
        fs.unlink(files.thumbnail[0].path, (err) => {})
      }
      if (files.game) {
        fs.unlink(files.game[0].path, (err) => {})
        fs.rm(
          `tmp/${req.params.gameID}`,
          { recursive: true, force: true },
          (err) => {}
        )
      }
      if (files.banner) {
        fs.unlink(files.banner[0].path, (err) => {})
      }
    } else {
      statusCode = 401
    }

    res.status(statusCode).json({})
  }
)

dashboard.delete('/:gameID', async (req, res) => {
  const privilege = req.headers['privilege'] as UserPrivilege

  let statusCode = 500

  if (privilege === 'admin') {
    console.log(`Deleting ${req.params.gameID}`)
    try {
      await Promise.allSettled([
        (async () => {
          const query = admin
            .firestore()
            .collection('games')
            .where('id', '==', Number(req.params.gameID))
            .limit(1)
          await (await query.get()).docs[0].ref.delete()
        })(),
      ]),
        (async () => {
          const query = admin.firestore().collection('gameslist').limit(1)

          const doc = (await query.get()).docs[0]
          const data = doc.data() as { data: GameListItem[] }

          data.data = data.data.filter(
            (item) => item.id !== Number(req.params.gameID)
          )

          await doc.ref.set(data)
        })(),
        (async () => {
          await deleteFolder(
            `${process.env.AWS_BUCKET}`,
            `${req.params.gameID}/`
          )
        })()
      statusCode = 200
    } catch (error) {
      console.error(error)
      statusCode = 500
    }
  } else {
    statusCode = 401
  }

  res.status(statusCode).json({})
})

// Game Settings

dashboard.patch('/:gameID/visibility', async (req, res) => {
  const privilege = req.headers['privilege'] as UserPrivilege

  const hidden = (await JSON.parse(req.body)).hidden as boolean

  let statusCode = 500

  if (privilege === 'admin' || privilege === 'privileged') {
    try {
      const query = admin.firestore().collection('gameslist').limit(1)

      const doc = (await query.get()).docs[0]
      const data = doc.data() as { data: GameListItem[] }

      data.data[
        data.data.findIndex((item) => item.id === Number(req.params.gameID))
      ].hidden = hidden

      await doc.ref.set(data)

      statusCode = 200
    } catch (error) {
      console.error(error)
      statusCode = 500
    }
  } else {
    statusCode = 401
  }

  res.status(statusCode).json({})
})

dashboard.patch('/:gameID/feature', async (req, res) => {
  const privilege = req.headers['privilege'] as UserPrivilege

  const featured = (await JSON.parse(req.body)).featured as boolean

  let statusCode = 500

  if (privilege === 'admin') {
    try {
      const query = admin.firestore().collection('gameslist').limit(1)

      const doc = (await query.get()).docs[0]
      const data = doc.data() as { data: GameListItem[] }

      data.data.map((x) => {
        if (x.id === Number(req.params.gameID)) {
          x.featured = featured
        } else {
          x.featured = false
        }
        return x
      })

      await doc.ref.set(data)

      statusCode = 200
    } catch (error) {
      console.error(error)
      statusCode = 500
    }
  } else {
    statusCode = 401
  }

  res.status(statusCode).json({})
})

dashboard.patch('/:gameID/approve', async (req, res) => {
  const privilege = req.headers['privilege'] as UserPrivilege

  let statusCode = 500

  if (privilege === 'admin' || privilege === 'privileged') {
    try {
      const query = admin.firestore().collection('gameslist').limit(1)

      const doc = (await query.get()).docs[0]
      const data = doc.data() as { data: GameListItem[] }

      data.data[
        data.data.findIndex((item) => item.id === Number(req.params.gameID))
      ].approved = true

      await doc.ref.set(data)

      statusCode = 200
    } catch (error) {
      console.error(error)
      statusCode = 500
    }
  } else {
    statusCode = 401
  }

  res.status(statusCode).json({})
})
