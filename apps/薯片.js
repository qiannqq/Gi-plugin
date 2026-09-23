import { image } from "../model/index.js"

const REDIS_PREFIX = "GiPlugin:ChipSnack:"
const GAME_TTL_SECONDS = 6 * 60 * 60
const groupQueues = new Map()

async function withGroupLock(groupId, callback) {
  const previous = groupQueues.get(groupId) || Promise.resolve()
  let release
  const current = new Promise(resolve => {
    release = resolve
  })
  groupQueues.set(groupId, current)
  await previous
  try {
    return await callback()
  } finally {
    release()
    if (groupQueues.get(groupId) === current) groupQueues.delete(groupId)
  }
}

function gameKey(groupId) {
  return `${REDIS_PREFIX}${groupId}`
}

function gameCodeKey(gameCode) {
  return `${REDIS_PREFIX}code:${gameCode}`
}

async function loadGame(groupId) {
  const value = await redis.get(gameKey(groupId))
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

async function saveGame(groupId, game) {
  await redis.set(gameKey(groupId), JSON.stringify(game))
  await redis.expire(gameKey(groupId), GAME_TTL_SECONDS)
  if (game.gameCode) {
    await redis.expire(gameCodeKey(game.gameCode), GAME_TTL_SECONDS)
  }
}

async function reserveGameCode(groupId) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const gameCode = String(Math.floor(Math.random() * 900) + 100)
    const result = await redis.set(gameCodeKey(gameCode), String(groupId), {
      EX: GAME_TTL_SECONDS,
      NX: true,
    })
    if (result === "OK") return gameCode
  }
  return null
}

async function deleteGame(groupId, game) {
  await redis.del(gameKey(groupId))
  if (game?.gameCode) {
    const indexedGroupId = await redis.get(gameCodeKey(game.gameCode))
    if (String(indexedGroupId) === String(groupId)) {
      await redis.del(gameCodeKey(game.gameCode))
    }
  }
}

function getUserId(e) {
  return String(e.user_id)
}

function getUserName(e) {
  return e.sender?.card || e.sender?.nickname || e.nickname || getUserId(e)
}

function getChipCount(playerCount) {
  return playerCount * 5
}

function getColumns(playerCount) {
  return Math.min(6, Math.max(4, playerCount))
}

function getCurrentPlayer(game) {
  return game.players[game.turnIndex]
}

function findNextAliveIndex(game, currentIndex) {
  for (let offset = 1; offset <= game.players.length; offset++) {
    const index = (currentIndex + offset) % game.players.length
    if (game.players[index].alive) return index
  }
  return -1
}

function makeBoardData(game, revealAll = false) {
  const mineSet = new Set(game.mines)
  const openedSet = new Set(game.opened)
  const total = getChipCount(game.players.length)
  const currentPlayer = game.phase === "playing" ? getCurrentPlayer(game) : null
  const phaseText =
    {
      planting: "秘密布雷中",
      playing: "轮流吃薯片",
      finished: "本局结束",
    }[game.phase] || "等待开局"

  return {
    title: "薯片排雷",
    phaseText,
    turnText: currentPlayer ? `现在轮到：${currentPlayer.name}` : "每人私聊 Bot 选择一片埋雷",
    playerText: `玩家 ${game.players.filter(player => player.alive).length}/${game.players.length} 存活`,
    columns: getColumns(game.players.length),
    chips: Array.from({ length: total }, (_, index) => {
      const id = index + 1
      const isMine = mineSet.has(id)
      let status = "covered"
      let symbol = String(id)
      let label = "未打开"

      if (openedSet.has(id) && isMine) {
        status = "bomb"
        symbol = "爆"
        label = "埋雷薯片"
      } else if (openedSet.has(id)) {
        status = "safe"
        symbol = "✓"
        label = "安全"
      } else if (revealAll && isMine) {
        status = "mine"
        symbol = "雷"
        label = "未被选中的雷"
      }

      return { id, status, symbol, label }
    }),
  }
}

export class Gi_chipSnack extends plugin {
  constructor() {
    super({
      name: "Gi小游戏:薯片排雷",
      dsc: "群友轮流吃薯片，踩雷出局",
      event: "message",
      priority: 500,
      rule: [
        { reg: "^(#|/)?开薯片游戏$", fnc: "createGame" },
        { reg: "^(#|/)?加入薯片$", fnc: "joinGame" },
        { reg: "^(#|/)?开始薯片$", fnc: "beginPlanting" },
        { reg: "^(#|/)?薯片埋雷\\s+\\d+\\s+\\d+$", fnc: "plantMine" },
        { reg: "^(#|/)?吃薯片\\s*\\d+$", fnc: "eatChip" },
        { reg: "^(#|/)?薯片状态$", fnc: "showStatus" },
        { reg: "^(#|/)?结束薯片游戏$", fnc: "cancelGame" },
      ],
    })
  }

  async renderBoard(game, revealAll = false) {
    const { img } = await image(
      this.e,
      "chips",
      "gi_chip_snack",
      makeBoardData(game, revealAll),
      "./plugins/Gi-plugin/resources/html/chips.html",
    )
    return img
  }

  async replyWithBoard(e, game, text, revealAll = false) {
    const message = Array.isArray(text) ? text : [text]
    try {
      const img = await this.renderBoard(game, revealAll)
      await e.reply(img ? [...message, img] : message)
    } catch (error) {
      logger.error(`[薯片排雷] 棋盘图片生成失败: ${error.message}`)
      await e.reply([...message, "棋盘图片生成失败，请根据编号继续游戏"])
    }
  }

  async replyTurnMessages(e, game, resultMessage) {
    let img
    try {
      img = await this.renderBoard(game)
    } catch (error) {
      logger.error(`[薯片排雷] 棋盘图片生成失败: ${error.message}`)
    }

    await e.reply(resultMessage)
    const instruction = "发送 #吃薯片 编号"
    await e.reply(img ? [instruction, img] : `${instruction}\n棋盘图片生成失败，请根据编号继续游戏`)
  }

  async sendToGroup(e, groupId, message) {
    const bots = globalThis.Bot
    const bot = bots?.[e.self_id] || bots?.[e.bot?.uin] || bots?.[bots?.uin]
    const group = bot?.pickGroup?.(String(groupId))
    if (!group) return false
    await group.sendMsg(message)
    return true
  }

  async createGame(e) {
    if (!e.isGroup || !e.group_id) {
      await e.reply("请在群里发起薯片游戏")
      return true
    }

    const groupId = String(e.group_id)
    await withGroupLock(groupId, async () => {
      const existing = await loadGame(groupId)
      if (existing) {
        await e.reply("本群已有薯片游戏，请先加入或结束当前游戏")
        return
      }

      const gameCode = await reserveGameCode(groupId)
      if (!gameCode) {
        await e.reply("暂时无法生成本局识别号，请稍后重试")
        return
      }

      const userId = getUserId(e)
      const game = {
        gameCode,
        phase: "lobby",
        hostId: userId,
        players: [{ id: userId, name: getUserName(e), alive: true }],
        mines: [],
        submittedIds: [],
        opened: [],
        turnIndex: 0,
        createdAt: Date.now(),
      }
      await saveGame(groupId, game)
      await e.reply(
        `薯片游戏已创建\n本局识别号 ${gameCode}\n发送 #加入薯片 报名，2～6 人加入后由发起人发送 #开始薯片`,
      )
    })
    return true
  }

  async joinGame(e) {
    if (!e.isGroup || !e.group_id) {
      await e.reply("请在群里加入薯片游戏")
      return true
    }

    const groupId = String(e.group_id)
    await withGroupLock(groupId, async () => {
      const game = await loadGame(groupId)
      if (!game || game.phase !== "lobby") {
        await e.reply("本群没有等待加入的薯片游戏")
        return
      }

      const userId = getUserId(e)
      if (game.players.some(player => player.id === userId)) {
        await e.reply("你已经加入这局游戏")
        return
      }
      if (game.players.length >= 6) {
        await e.reply("本局最多 6 人，报名已满")
        return
      }

      game.players.push({ id: userId, name: getUserName(e), alive: true })
      await saveGame(groupId, game)
      await e.reply(`${getUserName(e)} 加入成功 ${game.players.length}/6`)
    })
    return true
  }

  async beginPlanting(e) {
    if (!e.isGroup || !e.group_id) {
      await e.reply("请在群里开始薯片游戏")
      return true
    }

    const groupId = String(e.group_id)
    await withGroupLock(groupId, async () => {
      const game = await loadGame(groupId)
      if (!game || game.phase !== "lobby") {
        await e.reply("本群没有等待开始的薯片游戏")
        return
      }
      if (game.hostId !== getUserId(e) && !e.isMaster) {
        await e.reply("只有发起人可以开始布雷")
        return
      }
      if (game.players.length < 2) {
        await e.reply("至少需要 2 人才能开始\n邀请群友发送 #加入薯片")
        return
      }

      game.phase = "planting"
      if (!game.gameCode) {
        game.gameCode = await reserveGameCode(groupId)
        if (!game.gameCode) {
          await e.reply("暂时无法生成本局识别号，请稍后重试")
          return
        }
      }
      game.submittedIds = []
      game.mines = []
      game.players.forEach(player => {
        player.alive = true
      })
      await saveGame(groupId, game)

      const total = getChipCount(game.players.length)
      const text = [
        `布雷开始 ${game.players.length} 位玩家，每人选择 1 片，共 ${total} 片`,
        `本局识别号 ${game.gameCode}`,
        `私聊 Bot 发送\n#薯片埋雷 ${game.gameCode} 薯片编号`,
        "雷位和埋雷者不会在群里公布",
      ].join("\n")
      await this.replyWithBoard(e, game, text)
    })
    return true
  }

  async plantMine(e) {
    const match = String(e.msg || e.raw_message || "").match(/^(#|\/)?薯片埋雷\s+(\d{3})\s+(\d+)$/)
    if (!match) return true
    if (e.isGroup) {
      await e.reply("为避免公开雷位，请私聊 Bot 提交\n#薯片埋雷 局号 薯片编号")
      return true
    }

    const gameCode = match[2]
    const chipId = Number(match[3])
    const groupId = await redis.get(gameCodeKey(gameCode))
    if (!groupId) {
      await e.reply("没有找到这个局号对应的游戏，请检查局号或确认游戏仍在布雷阶段")
      return true
    }

    await withGroupLock(groupId, async () => {
      const game = await loadGame(groupId)
      if (!game || game.gameCode !== gameCode || game.phase !== "planting") {
        await e.reply("本群没有等待布雷的游戏，或布雷阶段已结束")
        return
      }

      const userId = getUserId(e)
      if (!game.players.some(player => player.id === userId)) {
        await e.reply("你没有加入本群游戏，不能埋雷")
        return
      }
      if (game.submittedIds.includes(userId)) {
        await e.reply("你已经提交过雷位，每人只能埋一颗雷")
        return
      }

      const total = getChipCount(game.players.length)
      if (chipId < 1 || chipId > total) {
        await e.reply(`薯片编号需在 1 到 ${total} 之间，请重新选择`)
        return
      }
      if (game.mines.includes(chipId)) {
        await deleteGame(groupId, game)
        await e.reply("埋雷位置重复，本局已作废\n请回群重新开始游戏")
        await this.sendToGroup(e, groupId, "埋雷位置重复，本局已作废\n请重新发送 #开薯片游戏")
        return
      }

      game.mines.push(chipId)
      game.mines.sort((left, right) => left - right)
      game.submittedIds.push(userId)
      game.submittedIds.sort()

      if (game.submittedIds.length < game.players.length) {
        await saveGame(groupId, game)
        await e.reply(`雷位已记录 ${chipId} 号\n等待其他玩家完成布雷`)
        return
      }

      game.phase = "playing"
      delete game.submittedIds
      game.turnIndex = 0
      await saveGame(groupId, game)
      await e.reply("雷位已记录")
      const firstPlayer = getCurrentPlayer(game)
      const message = [
        "布雷完成，游戏开始\n现在轮到 ",
        segment.at(Number(firstPlayer.id), firstPlayer.name),
        "\n发送 #吃薯片 编号",
      ]
      if (!(await this.sendToGroup(e, groupId, message))) {
        await e.reply("布雷完成，游戏已开始\n暂时无法通知原群，请回群发送 #薯片状态")
      }
    })
    return true
  }

  async eatChip(e) {
    if (!e.isGroup || !e.group_id) {
      await e.reply("请回游戏群选择薯片")
      return true
    }
    const match = String(e.msg || e.raw_message || "").match(/^(#|\/)?吃薯片\s*(\d+)$/)
    if (!match) return true

    const groupId = String(e.group_id)
    const chipId = Number(match[2])
    await withGroupLock(groupId, async () => {
      const game = await loadGame(groupId)
      if (!game || game.phase !== "playing") {
        await e.reply("本群没有正在进行的薯片游戏")
        return
      }

      const currentPlayer = getCurrentPlayer(game)
      if (!currentPlayer || currentPlayer.id !== getUserId(e)) {
        await e.reply(`现在轮到 ${currentPlayer?.name || "下一位玩家"}，请稍等`)
        return
      }

      const total = getChipCount(game.players.length)
      if (chipId < 1 || chipId > total) {
        await e.reply(`薯片编号需在 1 到 ${total} 之间`)
        return
      }
      if (game.opened.includes(chipId)) {
        await e.reply("这片薯片已经被吃过，请重新选择")
        return
      }

      const currentIndex = game.turnIndex
      const hitMine = game.mines.includes(chipId)
      game.opened.push(chipId)
      if (hitMine) currentPlayer.alive = false

      const allDead = game.players.every(player => !player.alive)
      const survivors = game.players.filter(player => player.alive)
      const safeChipsOpened = game.opened.filter(id => !game.mines.includes(id)).length
      const allSafeOpened = safeChipsOpened === total - game.mines.length

      if (allDead || survivors.length === 1 || allSafeOpened) {
        game.phase = "finished"
        const result = allDead
          ? "所有玩家都被炸飞，本局无人存活"
          : survivors.length === 1
            ? `最后一名存活者 ${survivors[0].name} 获胜`
            : `安全薯片已吃完，存活玩家获胜 ${survivors.map(player => player.name).join("、")}`
        const mineList = game.mines.join("、")
        const text = `${currentPlayer.name} 选择 ${chipId} 号薯片\n${hitMine ? "好吃到爆！" : "安全"}\n${result}\n本局雷位 ${mineList}`
        await this.replyWithBoard(e, game, text, true)
        await deleteGame(groupId, game)
        return
      }

      game.turnIndex = findNextAliveIndex(game, currentIndex)
      await saveGame(groupId, game)
      const nextPlayer = getCurrentPlayer(game)
      const result = hitMine ? "好吃到爆！" : "安全"
      const resultMessage = [
        `${currentPlayer.name} 玩家选择 ${chipId} 号薯片\n${result}\n下一位 `,
        segment.at(Number(nextPlayer.id), nextPlayer.name),
      ]
      await this.replyTurnMessages(e, game, resultMessage)
    })
    return true
  }

  async showStatus(e) {
    if (!e.isGroup || !e.group_id) {
      await e.reply("请在游戏群查看状态")
      return true
    }

    const game = await loadGame(String(e.group_id))
    if (!game) {
      await e.reply("本群没有薯片游戏\n发送 #开薯片游戏 创建一局")
      return true
    }

    const total = getChipCount(game.players.length)
    if (game.phase === "lobby") {
      await e.reply(`薯片游戏报名中 ${game.players.length}/6 人\n至少 2 人后由发起人开始`)
    } else if (game.phase === "planting") {
      await e.reply(`正在秘密布雷 ${game.submittedIds.length}/${game.players.length} 人已提交`)
    } else {
      const currentPlayer = getCurrentPlayer(game)
      const status = `薯片游戏进行中 ${game.players.filter(player => player.alive).length} 人存活，已吃 ${game.opened.length}/${total} 片`
      await e.reply(
        currentPlayer
          ? [status, "\n现在轮到 ", segment.at(Number(currentPlayer.id), currentPlayer.name)]
          : status,
      )
    }
    return true
  }

  async cancelGame(e) {
    if (!e.isGroup || !e.group_id) {
      await e.reply("请在游戏群结束本局")
      return true
    }

    const groupId = String(e.group_id)
    await withGroupLock(groupId, async () => {
      const game = await loadGame(groupId)
      if (!game) {
        await e.reply("本群没有薯片游戏")
        return
      }
      if (game.hostId !== getUserId(e) && !e.isMaster) {
        await e.reply("只有发起人或 Bot 管理员可以结束本局")
        return
      }
      await deleteGame(groupId, game)
      await e.reply("本局薯片游戏已结束，棋盘和雷位已清除")
    })
    return true
  }
}
