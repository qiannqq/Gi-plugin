import { randomUUID } from "node:crypto"
import { image } from "../model/index.js"
import getconfig from "../model/cfg.js"

const REDIS_PREFIX = "GiPlugin:ChipSnack:"
const GAME_TTL_SECONDS = 6 * 60 * 60
const DEFAULT_MAX_PLAYERS = 6
const MAX_PLAYERS = 10
const DEFAULT_CHIPS_PER_PLAYER = 12
const MIN_CHIPS_PER_PLAYER = 2
const MAX_CHIPS_PER_PLAYER = 20
const BUTTONS_PER_KEYBOARD = 25
const MAX_PASSIVE_REPLIES = 5
const PROGRESS_RECALL_SECONDS = 60
const GROUP_LOCK_TTL_MS = 60 * 1000
const GROUP_LOCK_RENEW_MS = 20 * 1000
const GROUP_LOCK_WAIT_MS = 15 * 1000
const RENEW_LOCK_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end"
const RELEASE_LOCK_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"
const groupQueues = new Map()

async function acquireGroupLock(groupId) {
  const lockKey = `${REDIS_PREFIX}lock:${groupId}`
  const token = randomUUID()
  const deadline = Date.now() + GROUP_LOCK_WAIT_MS

  while (Date.now() < deadline) {
    const acquired = await redis.set(lockKey, token, {
      NX: true,
      PX: GROUP_LOCK_TTL_MS,
    })
    if (acquired === "OK") {
      let lockLost = false
      let renewal = Promise.resolve()
      const timer = setInterval(() => {
        renewal = renewal
          .then(async () => {
            if (lockLost) return
            const result = await redis.eval(RENEW_LOCK_SCRIPT, {
              keys: [lockKey],
              arguments: [token, String(GROUP_LOCK_TTL_MS)],
            })
            if (Number(result) !== 1) lockLost = true
          })
          .catch(error => {
            lockLost = true
            logger.error(`[薯片排雷] 群锁续期失败: ${error.message}`)
          })
      }, GROUP_LOCK_RENEW_MS)
      timer.unref?.()

      return async () => {
        clearInterval(timer)
        await renewal
        const result = await redis.eval(RELEASE_LOCK_SCRIPT, {
          keys: [lockKey],
          arguments: [token],
        })
        if (lockLost || Number(result) !== 1) {
          logger.warn(`[薯片排雷] 群 ${groupId} 的分布式锁已失效`)
        }
      }
    }

    await new Promise(resolve => setTimeout(resolve, 50 + Math.floor(Math.random() * 100)))
  }

  throw new Error(`[薯片排雷] 等待群 ${groupId} 的分布式锁超时`)
}

async function withGroupLock(groupId, callback) {
  const queueKey = String(groupId)
  const previous = groupQueues.get(queueKey) || Promise.resolve()
  let release
  const current = new Promise(resolve => {
    release = resolve
  })
  groupQueues.set(queueKey, current)
  await previous
  let releaseDistributedLock
  try {
    releaseDistributedLock = await acquireGroupLock(queueKey)
    return await callback()
  } finally {
    try {
      if (releaseDistributedLock) await releaseDistributedLock()
    } finally {
      release()
      if (groupQueues.get(queueKey) === current) groupQueues.delete(queueKey)
    }
  }
}

function gameKey(groupId) {
  return `${REDIS_PREFIX}${groupId}`
}

function gameCodeKey(gameCode) {
  return `${REDIS_PREFIX}code:${gameCode}`
}

function groupChipCountKey(groupId) {
  return `${REDIS_PREFIX}settings:${groupId}:chipsPerPlayer`
}

function groupRevealMineOwnersKey(groupId) {
  return `${REDIS_PREFIX}settings:${groupId}:revealMineOwners`
}

async function loadChipsPerPlayer(groupId) {
  const value = Number(await redis.get(groupChipCountKey(groupId)))
  if (Number.isInteger(value) && value >= MIN_CHIPS_PER_PLAYER && value <= MAX_CHIPS_PER_PLAYER) {
    return value
  }
  return DEFAULT_CHIPS_PER_PLAYER
}

async function loadRevealMineOwners(groupId) {
  return (await redis.get(groupRevealMineOwnersKey(groupId))) === "1"
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
  await redis.set(
    gameKey(groupId),
    JSON.stringify(game),
    { EX: GAME_TTL_SECONDS },
  )
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
  if (isQBotCompatible(e)) return ""
  return e.sender?.card || e.sender?.nickname || e.nickname || getUserId(e)
}

function playerMention(e, player) {
  if (isQBotCompatible(e)) return { type: "at", id: String(player.id) }
  return segment.at(Number(player.id), player.name)
}

function isQBotCompatible(e) {
  let mode
  try {
    mode = getconfig("config", "config").config?.["qqbot-compatible"]
  } catch {}

  if (mode === false || mode === "false") return false
  if (mode === true || mode === "true") return true

  const bot = e.bot || globalThis.Bot?.[e.self_id]
  const adapterNames = [e.adapter, e.raw?.adapter, e.bot?.adapter, bot?.adapter, globalThis.Bot?.adapter]
    .flatMap(adapter => {
      if (typeof adapter === "string") return [adapter]
      if (Array.isArray(adapter)) return adapter
      if (adapter && typeof adapter === "object") return [adapter.id, adapter.name, adapter.type]
      return []
    })
  return Boolean(
    e.qqbot ||
      /[a-z]/i.test(String(e.self_id || "")) ||
      adapterNames.some(adapter => typeof adapter === "string" && /qbot/i.test(adapter)),
  )
}

function markdownText(content) {
  return { type: "markdown", content }
}

function markdownParts(message) {
  return message.map(part => (typeof part === "string" ? markdownText(part) : part))
}

function makeCurrentPlayerQuote(e, player, instruction) {
  const message = [markdownText("\n\n> **当前玩家：** "), playerMention(e, player)]
  if (instruction) message.push(markdownText(`\n> ${instruction}`))
  return message
}

function makePlayerListQuote(e, players, label) {
  if (!players.length) return []
  const mentions = players.flatMap((player, index) =>
    index ? [markdownText("、"), playerMention(e, player)] : [playerMention(e, player)],
  )
  return [markdownText(`\n\n> **${label}：** `), ...mentions]
}

function makeDeathSummary(e, game) {
  const compatible = isQBotCompatible(e)
  const deaths = game.deaths || []
  const details = deaths.length
    ? deaths.flatMap(death => {
        const revealOwner = game.revealMineOwners && Boolean(death.mineOwnerId)
        const ownMine = revealOwner && death.playerId === death.mineOwnerId
        const ownerName = death.mineOwnerName || "未知玩家"
        const description = [
          ` 吃了 ${death.chipId} 号薯片，爆了`,
          revealOwner ? `（埋雷者：${ownMine ? "自己" : ownerName}）` : "",
        ].join("")
        if (!compatible) return [`\n${death.playerName}${description}`]

        const player = { id: death.playerId, name: death.playerName }
        const owner = revealOwner ? { id: death.mineOwnerId, name: ownerName } : null
        const ownerDetails = revealOwner
          ? [
              markdownText("（埋雷者："),
              ownMine ? markdownText("自己") : playerMention(e, owner),
              markdownText("）"),
            ]
          : []
        return [
          markdownText("\n> "),
          playerMention(e, player),
          markdownText(` 吃了 ${death.chipId} 号薯片，爆了`),
          ...ownerDetails,
        ]
      })
    : compatible
      ? [markdownText("\n> 本局无人因踩雷出局")]
      : ["无人因踩雷出局"]

  return [
    compatible ? markdownText("\n\n**出局记录：**") : "\n出局记录：",
    ...details,
  ]
}

function makeMineOwnerSection(e, game, mineOwnerDetails) {
  if (!game.revealMineOwners || !mineOwnerDetails.length) return []
  return [
    isQBotCompatible(e) ? markdownText("\n\n**埋雷记录：**") : "\n\n埋雷记录：",
    ...mineOwnerDetails,
  ]
}

function makeMineOwnerDetails(e, game, onlyChipId, excludedChipId) {
  if (!game.revealMineOwners) return []

  const entries = Object.entries(game.mineOwners || {})
    .map(([ownerId, chipId]) => ({
      chipId: Number(chipId),
      owner: {
        id: ownerId,
        name:
          game.mineOwnerNames?.[ownerId] ||
          game.players.find(player => player.id === ownerId)?.name ||
          ownerId,
      },
    }))
    .filter(
      entry =>
        Number.isInteger(entry.chipId) &&
        (onlyChipId === undefined || entry.chipId === onlyChipId) &&
        (excludedChipId === undefined || entry.chipId !== excludedChipId),
    )
    .sort((left, right) => left.chipId - right.chipId)
  if (!entries.length) return []

  const compatible = isQBotCompatible(e)
  return [
    ...entries.flatMap(({ chipId, owner }) => [
      compatible ? markdownText("\n> ") : "\n",
      playerMention(e, owner),
      compatible
        ? markdownText(` 埋下了 ${chipId} 号薯片`)
        : ` 埋下了 ${chipId} 号薯片`,
    ]),
  ]
}

function getChipCount(playerCount, chipsPerPlayer = DEFAULT_CHIPS_PER_PLAYER) {
  return playerCount * chipsPerPlayer
}

function promoteRandomPlayer(game) {
  const player = game.players[Math.floor(Math.random() * game.players.length)]
  game.hostId = player.id
  return player
}

function isGroupManager(e) {
  return ["owner", "admin"].includes(e.sender?.role) || ["owner", "admin"].includes(e.member?.role)
}

function getColumns(playerCount) {
  return Math.min(MAX_PLAYERS, Math.max(4, playerCount))
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

function makeBoardData(game, revealAll = false, showPlayerNames = true) {
  const mineSet = new Set(game.mines)
  const openedSet = new Set(game.opened)
  const total =
    game.totalChips ||
    getChipCount(game.players.length, game.chipsPerPlayer || DEFAULT_CHIPS_PER_PLAYER)
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
    turnText: currentPlayer
      ? showPlayerNames
        ? `现在轮到：${currentPlayer.name}`
        : "等待当前玩家选择薯片"
      : "秘密选择一片埋雷",
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
        { reg: "^(#|/)?开薯片游戏(?:\\s+\\d+)?$", fnc: "createGame" },
        { reg: "^(#|/)?加入薯片$", fnc: "joinGame" },
        { reg: "^(#|/)?退出薯片$", fnc: "exitGame" },
        { reg: "^(#|/)?开始薯片$", fnc: "beginPlanting" },
        { reg: "^(#|/)?设置薯片数量\\s+\\d+$", fnc: "setChipsPerPlayer" },
        { reg: "^(#|/)?设置薯片公开埋雷者\\s+(开|关)$", fnc: "setMineOwnerReveal" },
        { reg: "^(#|/)?薯片埋雷\\s+\\d+\\s+\\d+$", fnc: "plantMine" },
        { reg: "gi-chip-mine:\\d{3}:\\d+", fnc: "plantMine" },
        { reg: "gi-chip-eat:\\d{3}:\\d+", fnc: "eatChip" },
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
      makeBoardData(game, revealAll, !isQBotCompatible(this.e)),
      "./plugins/Gi-plugin/resources/html/chips.html",
    )
    return img
  }

  async replyWithBoard(e, game, text, revealAll = false, replyExtra) {
    const message = Array.isArray(text) ? text : [text]
    if (isQBotCompatible(e)) {
      const markdownMessage = markdownParts(message)
      const { keyboards, ...extra } = replyExtra || {}
      if (Array.isArray(keyboards)) {
        if (keyboards.length) {
          for (const keyboard of keyboards) {
            const content = keyboard
              ? markdownMessage
              : [...markdownMessage, markdownText("\n该编号段已没有可选薯片")]
            await e.reply(content, false, keyboard ? { ...extra, keyboard } : extra)
          }
        } else {
          await e.reply(markdownMessage, false, extra)
        }
      } else {
        await e.reply(markdownMessage, false, replyExtra)
      }
      return
    }

    try {
      const img = await this.renderBoard(game, revealAll)
      await e.reply(img ? [...message, img] : message, false, replyExtra)
    } catch (error) {
      logger.error(`[薯片排雷] 棋盘图片生成失败: ${error.message}`)
      const fallback = isQBotCompatible(e)
        ? "棋盘图片生成失败，请点击下方按钮继续"
        : "棋盘图片生成失败，请根据编号继续游戏"
      await e.reply([...message, fallback], false, replyExtra)
    }
  }

  async replyTurnMessages(e, game, resultMessage) {
    if (isQBotCompatible(e)) {
      await this.replyWithBoard(
        e,
        game,
        [
          ...resultMessage,
          ...makeCurrentPlayerQuote(e, getCurrentPlayer(game), "点击下方按钮选择薯片"),
        ],
        false,
        { keyboards: this.makeGameKeyboards(game, "playing") },
      )
      return
    }

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

  async sendToGroup(e, groupId, message, recallAfterSeconds = 0) {
    const bots = globalThis.Bot
    const bot = bots?.[e.self_id] || bots?.[e.bot?.uin] || bots?.[bots?.uin]
    const group = bot?.pickGroup?.(String(groupId))
    if (!group) return false
    const result = await group.sendMsg(message)
    const messageIds = result?.message_id
    if (
      recallAfterSeconds > 0 &&
      messageIds &&
      typeof group.recallMsg === "function"
    ) {
      const timer = setTimeout(async () => {
        try {
          await group.recallMsg(messageIds)
        } catch (error) {
          globalThis.logger?.warn?.("[薯片] 撤回布雷进度消息失败", error)
        }
      }, recallAfterSeconds * 1000)
      timer.unref?.()
    }
    return true
  }

  getSelectableChipIds(game, phase) {
    const total = game.totalChips || getChipCount(game.players.length, game.chipsPerPlayer)
    const unavailable = phase === "playing" ? new Set(game.opened || []) : new Set()
    return Array.from({ length: total }, (_, index) => index + 1).filter(
      chipId => !unavailable.has(chipId),
    )
  }

  makeCommandButton(id, label, command, permission = { type: 2 }) {
    return {
      id,
      render_data: { label, visited_label: "已发送", style: 1 },
      action: {
        type: 2,
        permission,
        data: command,
        enter: true,
      },
    }
  }

  makeLobbyKeyboard(game) {
    const startPermission = game.hostId
      ? { type: 0, specify_user_ids: [String(game.hostId)] }
      : { type: 2 }
    return {
      content: {
        rows: [
          {
            buttons: [
              this.makeCommandButton(`lobby-${game.gameCode}-join`, "加入游戏", "#加入薯片"),
              this.makeCommandButton(
                `lobby-${game.gameCode}-start`,
                "开始游戏",
                "#开始薯片",
                startPermission,
              ),
              this.makeCommandButton(`lobby-${game.gameCode}-exit`, "退出游戏", "#退出薯片"),
            ],
          },
        ],
      },
    }
  }

  makeRestartKeyboard(game) {
    const maxPlayers = game.maxPlayers || DEFAULT_MAX_PLAYERS
    return {
      content: {
        rows: [
          {
            buttons: [
              this.makeCommandButton(
                `restart-${game.gameCode}`,
                "再来一把",
                `#开薯片游戏 ${maxPlayers}`,
              ),
            ],
          },
        ],
      },
    }
  }

  makeGameKeyboards(game, phase) {
    const selectableChipIds = this.getSelectableChipIds(game, phase)
    const playerIds =
      phase === "planting"
        ? game.players
            .filter(player => !(game.submittedIds || []).includes(player.id))
            .map(player => String(player.id))
        : [String(getCurrentPlayer(game)?.id || "")].filter(Boolean)
    const makeButton = (id, label, data, modal) => ({
      id,
      render_data: { label, visited_label: "已选择", style: 1 },
      action: {
        type: 1,
        permission: { type: 0, specify_user_ids: playerIds },
        data,
        ...(modal ? { modal } : {}),
      },
    })
    const keyboards = []
    for (let offset = 0; offset < selectableChipIds.length; offset += BUTTONS_PER_KEYBOARD) {
      const chips = selectableChipIds
        .slice(offset, offset + BUTTONS_PER_KEYBOARD)
        .map(chipId =>
          makeButton(
            `${phase}-${game.gameCode}-${chipId}`,
            String(chipId),
            `gi-chip-${phase === "planting" ? "mine" : "eat"}:${game.gameCode}:${chipId}`,
            phase === "planting"
              ? {
                  content: `确认埋下 ${chipId} 号薯片？`,
                  confirm_text: "埋雷",
                  cancel_text: "取消",
                }
              : undefined,
          ),
        )
      const rows = []
      for (let index = 0; index < chips.length; index += 5) {
        rows.push({ buttons: chips.slice(index, index + 5) })
      }
      keyboards.push({ content: { rows } })
    }
    return keyboards
  }

  async createGame(e) {
    if (!e.isGroup || !e.group_id) {
      await e.reply("请在群里发起薯片游戏")
      return true
    }

    const match = String(e.msg || e.raw_message || "").match(/^(#|\/)?开薯片游戏(?:\s+(\d+))?$/)
    const maxPlayers = match?.[2] ? Number(match[2]) : DEFAULT_MAX_PLAYERS
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > MAX_PLAYERS) {
      await e.reply(`本局人数上限需设置为 2 到 ${MAX_PLAYERS} 人`)
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
        await e.reply(
          isQBotCompatible(e)
            ? "暂时无法初始化本局，请稍后重试"
            : "暂时无法生成本局识别号，请稍后重试",
        )
        return
      }

      const userId = getUserId(e)
      const game = {
        gameCode,
        phase: "lobby",
        maxPlayers,
        hostId: userId,
        players: [{ id: userId, name: getUserName(e), alive: true }],
        mines: [],
        submittedIds: [],
        opened: [],
        turnIndex: 0,
        createdAt: Date.now(),
      }
      await saveGame(groupId, game)
      const gameCodeText = isQBotCompatible(e) ? "" : `\n本局识别号 ${gameCode}`
      const message = isQBotCompatible(e)
        ? markdownText(
            `## 薯片游戏已创建\n\n**人数上限：** ${maxPlayers} 人\n\n点击「加入游戏」按钮或发送 \`#加入薯片\` 报名；满员后自动进入布雷阶段，发起人也可发送 \`#开始薯片\` 提前开始布雷\n\n点击「退出游戏」按钮或发送 \`#退出薯片\` 可退出本局`,
          )
        : `薯片游戏已创建（${maxPlayers} 人上限）${gameCodeText}\n发送 #加入薯片 报名，满员后自动进入布雷阶段；发起人也可发送 #开始薯片 提前开始布雷\n发送 #退出薯片 可退出本局`
      if (isQBotCompatible(e)) {
        await e.reply(message, false, { keyboard: this.makeLobbyKeyboard(game) })
      } else {
        await e.reply(message)
      }
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
      const maxPlayers = game.maxPlayers || DEFAULT_MAX_PLAYERS
      if (game.players.length >= maxPlayers) {
        await e.reply(`本局最多 ${maxPlayers} 人，报名已满`)
        return
      }

      const player = { id: userId, name: getUserName(e), alive: true }
      game.players.push(player)
      const compatible = isQBotCompatible(e)
      if (game.players.length >= maxPlayers) {
        if (compatible) {
          await e.reply([
            playerMention(e, player),
            markdownText(` **加入成功**（${game.players.length}/${maxPlayers}）`),
          ])
        }
        await this.beginPlantingLocked(
          e,
          groupId,
          game,
          `报名已满 ${game.players.length}/${maxPlayers} 人，自动开始布雷`,
        )
        return
      }

      await saveGame(groupId, game)
      if (compatible) {
        await e.reply(
          [
            playerMention(e, player),
            markdownText(` **加入成功**（${game.players.length}/${maxPlayers}）`),
          ],
          false,
          { keyboard: this.makeLobbyKeyboard(game) },
        )
      } else {
        await e.reply(`${player.name} 加入成功 ${game.players.length}/${maxPlayers}`)
      }
    })
    return true
  }

  async beginPlantingLocked(e, groupId, game, announcement) {
    if (!game.gameCode) {
      game.gameCode = await reserveGameCode(groupId)
      if (!game.gameCode) {
        await e.reply(
          isQBotCompatible(e)
            ? "暂时无法初始化本局，请稍后重试"
            : "暂时无法生成本局识别号，请稍后重试",
        )
        return false
      }
    }

    const chipsPerPlayer = await loadChipsPerPlayer(groupId)
    const totalChips = getChipCount(game.players.length, chipsPerPlayer)
    const compatible = isQBotCompatible(e)
    const maxButtons = BUTTONS_PER_KEYBOARD * MAX_PASSIVE_REPLIES
    if (compatible && totalChips > maxButtons) {
      const maxPerPlayer = Math.floor(maxButtons / game.players.length)
      await e.reply(
        `本局共 ${totalChips} 片，QQBot 每次最多发送 ${MAX_PASSIVE_REPLIES} 条、每条 ${BUTTONS_PER_KEYBOARD} 个按钮；请将每人薯片数调至 ${maxPerPlayer} 或更少后再开始`,
      )
      return false
    }

    game.phase = "planting"
    game.maxPlayers ||= DEFAULT_MAX_PLAYERS
    game.chipsPerPlayer = chipsPerPlayer
    game.totalChips = totalChips
    game.revealMineOwners = await loadRevealMineOwners(groupId)
    game.submittedIds = []
    game.mines = []
    game.mineOwners = {}
    game.mineOwnerNames = {}
    game.opened = []
    game.players.forEach(player => {
      player.alive = true
    })
    await saveGame(groupId, game)

    const text = compatible
      ? [
          markdownText(
            [
              `## ${announcement}`,
              `**布雷开始** · ${game.players.length} 位玩家 · 共 ${game.totalChips} 片（每人 ${chipsPerPlayer} 片）`,
              "点击下方按钮，秘密选择一片埋雷",
              game.revealMineOwners
                ? "**埋雷者公开：** 结算时会公布每位埋雷者对应的薯片编号"
                : "**保密提示：** 结算只公布雷位，不公布埋雷者",
              "发送 `#退出薯片` 可退出本局",
            ].join("\n\n"),
          ),
        ]
      : [
          announcement,
          `布雷开始 ${game.players.length} 位玩家，每人选择 1 片，共 ${game.totalChips} 片（每人 ${chipsPerPlayer} 片）`,
          `本局识别号 ${game.gameCode}`,
          `私聊 Bot 发送\n#薯片埋雷 ${game.gameCode} 薯片编号`,
          game.revealMineOwners
            ? "结算时会公布每位埋雷者对应的薯片编号"
            : "结算只公布雷位，不公布埋雷者",
          "游戏中发送 #退出薯片 可退出本局",
        ]
    await this.replyWithBoard(
      e,
      game,
      text,
      false,
      compatible ? { keyboards: this.makeGameKeyboards(game, "planting") } : undefined,
    )
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
        await e.reply("本群当前没有等待开始的薯片游戏")
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

      await this.beginPlantingLocked(e, groupId, game, "发起人已提前开始游戏，现进入布雷阶段")
    })
    return true
  }

  async setChipsPerPlayer(e) {
    if (!e.isGroup || !e.group_id) {
      await e.reply("请在群聊中设置每人薯片数量")
      return true
    }

    const match = String(e.msg || e.raw_message || "").match(/^(#|\/)?设置薯片数量\s+(\d+)$/)
    const chipsPerPlayer = Number(match?.[2])
    if (
      !Number.isInteger(chipsPerPlayer) ||
      chipsPerPlayer < MIN_CHIPS_PER_PLAYER ||
      chipsPerPlayer > MAX_CHIPS_PER_PLAYER
    ) {
      await e.reply(`每人薯片数量需设置为 ${MIN_CHIPS_PER_PLAYER} 到 ${MAX_CHIPS_PER_PLAYER}`)
      return true
    }

    const groupId = String(e.group_id)
    await withGroupLock(groupId, async () => {
      await redis.set(groupChipCountKey(groupId), String(chipsPerPlayer))
      await e.reply(
        isQBotCompatible(e)
          ? markdownText(
              `**群设置已更新**\n\n每人薯片数量：**${chipsPerPlayer}**\n\n下次开始布雷时生效`,
            )
          : `本群每人薯片数量已设为 ${chipsPerPlayer}，下次开始布雷时生效`,
      )
    })
    return true
  }

  async setMineOwnerReveal(e) {
    if (!e.isGroup || !e.group_id) {
      await e.reply("请在群聊中设置是否公开埋雷者")
      return true
    }

    const match = String(e.msg || e.raw_message || "").match(/^(#|\/)?设置薯片公开埋雷者\s+(开|关)$/)
    const enabled = match?.[2] === "开"
    const groupId = String(e.group_id)
    await withGroupLock(groupId, async () => {
      await redis.set(groupRevealMineOwnersKey(groupId), enabled ? "1" : "0")
      await e.reply(
        isQBotCompatible(e)
          ? markdownText(
              `**群设置已更新**\n\n游戏结束后公开埋雷者：**${enabled ? "开启" : "关闭"}**\n\n下次开始布雷时生效`,
            )
          : `本群游戏结束后公开埋雷者已${enabled ? "开启" : "关闭"}，下次开始布雷时生效`,
      )
    })
    return true
  }

  async plantMine(e) {
    const rawMessage = String(e.msg || e.raw_message || "")
    const buttonMatch = rawMessage.match(/gi-chip-mine:(\d{3}):(\d+)/)
    const textMatch = rawMessage.match(/^(#|\/)?薯片埋雷\s+(\d{3})\s+(\d+)$/)
    const isButton = Boolean(buttonMatch)
    const compatible = isQBotCompatible(e)
    if (!buttonMatch && !textMatch) return true
    if (isButton && (!compatible || e.sub_type !== "callback" || !e.isGroup || !e.group_id)) return true
    if (compatible && !isButton) {
      await e.reply("请回游戏群点击埋雷按钮；官方 Bot 暂不支持私聊提交")
      return true
    }
    if (e.isGroup && !isButton) {
      await e.reply("为避免公开雷位，请私聊 Bot 提交\n#薯片埋雷 局号 薯片编号")
      return true
    }

    const gameCode = isButton ? buttonMatch[1] : textMatch[2]
    const chipId = Number(isButton ? buttonMatch[2] : textMatch[3])
    const groupId = isButton ? String(e.group_id) : await redis.get(gameCodeKey(gameCode))
    if (!groupId) {
      await e.reply(
        compatible
          ? "本群当前没有正在布雷的薯片游戏"
          : "没有找到对应的游戏，请检查局号或确认游戏仍处于布雷阶段",
      )
      return true
    }

    await withGroupLock(groupId, async () => {
      const game = await loadGame(groupId)
      if (!game || game.gameCode !== gameCode || game.phase !== "planting") {
        await e.reply("本群当前没有正在布雷的薯片游戏")
        return
      }

      const userId = getUserId(e)
      const player = game.players.find(player => player.id === userId)
      if (!player) {
        await e.reply("你不是本局玩家，不能提交雷位")
        return
      }
      if (game.submittedIds.includes(userId)) {
        await e.reply("你已提交过雷位，每位玩家只能埋一颗雷")
        return
      }

      const total =
        game.totalChips ||
        getChipCount(game.players.length, game.chipsPerPlayer || DEFAULT_CHIPS_PER_PLAYER)
      if (chipId < 1 || chipId > total) {
        await e.reply(`薯片编号需在 1 到 ${total} 之间，请重新选择`)
        return
      }
      if (game.mines.includes(chipId)) {
        await deleteGame(groupId, game)
        if (compatible) {
          await e.reply(
            markdownText("## 本局已作废\n\n检测到重复雷位，游戏数据已清除。点击「重新开局」创建新局"),
            false,
            { keyboard: this.makeRestartKeyboard(game) },
          )
          return
        }

        await e.reply("发现重复雷位，本局已作废，请回群重新开始")
        const notified = await this.sendToGroup(
          e,
          groupId,
          "本局布雷出现重复雷位，游戏已作废，请重新发起",
        )
        if (!notified) await e.reply("暂时无法通知原群，请回群告知群友本局已作废")
        return
      }

      game.mines.push(chipId)
      game.mines.sort((left, right) => left - right)
      game.mineOwners ||= {}
      game.mineOwners[userId] = chipId
      game.mineOwnerNames ||= {}
      game.mineOwnerNames[userId] = player.name
      game.submittedIds.push(userId)
      game.submittedIds.sort()
      const progressMessage = compatible
        ? [
            { type: "at", id: userId },
            markdownText(` 已埋好 · **${game.submittedIds.length}/${game.players.length}**`),
          ]
        : `${player.name} 已埋好（${game.submittedIds.length}/${game.players.length}）`

      if (game.submittedIds.length < game.players.length) {
        await saveGame(groupId, game)
        if (compatible) {
          await e.reply(progressMessage, false, { recallMsg: PROGRESS_RECALL_SECONDS })
        } else {
          await e.reply("已收到你的雷位，等待其他玩家完成布雷")
          if (!(await this.sendToGroup(e, groupId, progressMessage, PROGRESS_RECALL_SECONDS))) {
            await e.reply("暂时无法通知原群，请回群查看布雷进度")
          }
        }
        return
      }

      game.phase = "playing"
      delete game.submittedIds
      game.turnIndex = 0
      await saveGame(groupId, game)
      if (!compatible) await e.reply("埋雷成功，所有玩家已完成布雷，游戏开始")
      const firstPlayer = getCurrentPlayer(game)
      const message = compatible
        ? [
            ...progressMessage,
            markdownText("\n**布雷完成，游戏开始**"),
            ...makeCurrentPlayerQuote(e, firstPlayer, "点击下方按钮选择薯片"),
          ]
        : [
            `${progressMessage}\n布雷完成，游戏开始\n现在轮到 `,
            playerMention(e, firstPlayer),
            "\n发送 #吃薯片 编号",
          ]
      if (compatible) {
        await this.replyWithBoard(e, game, message, false, {
          keyboards: this.makeGameKeyboards(game, "playing"),
        })
      } else if (!(await this.sendToGroup(e, groupId, message))) {
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
    const rawMessage = String(e.msg || e.raw_message || "")
    const buttonMatch = rawMessage.match(/gi-chip-eat:(\d{3}):(\d+)/)
    const textMatch = rawMessage.match(/^(#|\/)?吃薯片\s*(\d+)$/)
    const isButton = Boolean(buttonMatch)
    const compatible = isQBotCompatible(e)
    if (!buttonMatch && !textMatch) return true
    if (isButton && (!compatible || e.sub_type !== "callback")) return true

    const groupId = String(e.group_id)
    const chipId = Number(isButton ? buttonMatch[2] : textMatch[2])
    await withGroupLock(groupId, async () => {
      const game = await loadGame(groupId)
      if (!game || game.phase !== "playing") {
        await e.reply("本群没有正在进行的薯片游戏")
        return
      }

      const currentPlayer = getCurrentPlayer(game)
      if (!currentPlayer || currentPlayer.id !== getUserId(e)) {
        return
      }

      const total =
        game.totalChips ||
        getChipCount(game.players.length, game.chipsPerPlayer || DEFAULT_CHIPS_PER_PLAYER)
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
      const ateOwnMine =
        hitMine && Number(game.mineOwners?.[currentPlayer.id]) === chipId
      const resultText = hitMine ? "💥 好吃到爆！" : "✅ 安全"
      game.opened.push(chipId)
      if (hitMine) {
        currentPlayer.alive = false
        game.deaths ||= []
        const mineOwner = Object.entries(game.mineOwners || {}).find(
          ([, plantedChipId]) => Number(plantedChipId) === chipId,
        )
        game.deaths.push({
          playerId: currentPlayer.id,
          playerName: currentPlayer.name,
          chipId,
          mineOwnerId: mineOwner?.[0] || null,
          mineOwnerName:
            (mineOwner &&
              (game.mineOwnerNames?.[mineOwner[0]] ||
                game.players.find(player => player.id === mineOwner[0])?.name)) ||
            "未知玩家",
        })
      }

      const allDead = game.players.every(player => !player.alive)
      const survivors = game.players.filter(player => player.alive)
      const safeChipsOpened = game.opened.filter(id => !game.mines.includes(id)).length
      const allSafeOpened = safeChipsOpened === total - game.mines.length
      const allRemainingChipsAreMines = allSafeOpened && game.opened.length < total

      if (allDead || survivors.length === 1 || allSafeOpened) {
        game.phase = "finished"
        const compatible = isQBotCompatible(e)
        const result = allDead
          ? "所有玩家都被炸飞，本局无人存活"
          : survivors.length === 1
            ? compatible
              ? "本局结束"
              : `最后一名存活者 ${survivors[0].name} 获胜`
            : allRemainingChipsAreMines
              ? compatible
                ? "剩下的薯片全是雷，存活玩家获胜"
                : `剩下的薯片全是雷，存活玩家 ${survivors.map(player => player.name).join("、")} 获胜`
            : compatible
              ? "所有安全薯片均已吃完"
              : `所有安全薯片均已吃完，存活玩家 ${survivors.map(player => player.name).join("、")} 获胜`
        const mineOwnerDetails = makeMineOwnerDetails(
          e,
          game,
          undefined,
          ateOwnMine ? chipId : undefined,
        )
        const ownMineMessage = ateOwnMine
          ? compatible
            ? [
                markdownText("\n\n"),
                playerMention(e, currentPlayer),
                markdownText(" 吃到了自己的雷！"),
              ]
            : `\n${currentPlayer.name}吃到了自己的雷！`
          : null
        const mineList = game.mines.join("、")
          const mineListDetails = game.revealMineOwners
            ? []
            : [
                compatible
                  ? markdownText(`\n\n**本局雷位：** \`${mineList}\``)
                  : `\n本局雷位 ${mineList}`,
              ]
        const text = compatible
          ? [
              playerMention(e, currentPlayer),
              markdownText(` 选择 **${chipId} 号薯片**\n\n**${resultText}**`),
              ...(ownMineMessage || []),
              markdownText(`\n\n${result}`),
              ...makePlayerListQuote(
                e,
                survivors,
                "获胜玩家",
              ),
              ...makeDeathSummary(e, game),
              ...makeMineOwnerSection(e, game, mineOwnerDetails),
              ...mineListDetails,
            ]
          : [
              `${currentPlayer.name} 选择 ${chipId} 号薯片\n${resultText}${ownMineMessage || ""}\n${result}`,
              ...makeDeathSummary(e, game),
              ...makeMineOwnerSection(e, game, mineOwnerDetails),
              ...mineListDetails,
            ]
        await this.replyWithBoard(
          e,
          game,
          text,
          true,
          compatible ? { keyboard: this.makeRestartKeyboard(game) } : undefined,
        )
        await deleteGame(groupId, game)
        return
      }

      game.turnIndex = findNextAliveIndex(game, currentIndex)
      await saveGame(groupId, game)
      const nextPlayer = getCurrentPlayer(game)
      const mineOwnerDetails = hitMine && !ateOwnMine ? makeMineOwnerDetails(e, game, chipId) : []
      const ownMineMessage = ateOwnMine
        ? compatible
          ? [
              markdownText("\n\n"),
              playerMention(e, currentPlayer),
              markdownText(" 吃到了自己的雷！"),
            ]
          : `\n${currentPlayer.name}吃到了自己的雷！`
        : null
      const resultMessage = compatible
        ? [
            playerMention(e, currentPlayer),
            markdownText(` 选择 **${chipId} 号薯片**\n\n**${resultText}**`),
            ...(ownMineMessage || []),
            ...mineOwnerDetails,
          ]
        : [
            `${currentPlayer.name} 选择了 ${chipId} 号薯片\n${resultText}${ownMineMessage || ""}`,
            ...mineOwnerDetails,
            "\n下一位 ",
            playerMention(e, nextPlayer),
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

    const total =
      game.totalChips ||
      getChipCount(game.players.length, game.chipsPerPlayer || DEFAULT_CHIPS_PER_PLAYER)
    if (game.phase === "lobby") {
      const maxPlayers = game.maxPlayers || DEFAULT_MAX_PLAYERS
      const status = isQBotCompatible(e)
        ? markdownText(
            `## 薯片游戏报名中\n\n**报名人数：** ${game.players.length}/${maxPlayers}\n\n满员后自动开局；发起人可提前开局`,
          )
        : `薯片游戏报名中 ${game.players.length}/${maxPlayers} 人\n满员后自动开局；发起人可提前开局`
      await e.reply(status)
    } else if (game.phase === "planting") {
      const submitted = (game.submittedIds || []).length
      const status = isQBotCompatible(e)
        ? markdownText(
            `## 秘密布雷中\n\n**已提交：** ${submitted}/${game.players.length} 人\n\n雷位不会在布雷完成前公开`,
          )
        : `秘密布雷进行中，已提交 ${submitted}/${game.players.length} 人`
      await e.reply(status)
    } else {
      const currentPlayer = getCurrentPlayer(game)
      const status = isQBotCompatible(e)
        ? markdownText(
            `## 薯片游戏进行中\n\n**存活：** ${game.players.filter(player => player.alive).length} 人\n**已吃：** ${game.opened.length}/${total} 片`,
          )
        : `薯片游戏进行中 ${game.players.filter(player => player.alive).length} 人存活，已吃 ${game.opened.length}/${total} 片`
      await e.reply(
        currentPlayer
          ? isQBotCompatible(e)
            ? [status, ...makeCurrentPlayerQuote(e, currentPlayer)]
            : [status, "\n现在轮到 ", playerMention(e, currentPlayer)]
          : status,
      )
    }
    return true
  }

  async exitGame(e) {
    if (!e.isGroup || !e.group_id) {
      await e.reply("请在对应群聊退出薯片游戏")
      return true
    }

    const groupId = String(e.group_id)
    await withGroupLock(groupId, async () => {
      const game = await loadGame(groupId)
      if (!game) {
        await e.reply("本群没有可退出的薯片游戏")
        return
      }

      const userId = getUserId(e)
      const playerIndex = game.players.findIndex(player => player.id === userId)
      if (playerIndex < 0) {
        await e.reply("你没有加入本局游戏")
        return
      }

      const wasHost = game.hostId === userId
      const wasCurrentPlayer = game.phase === "playing" && getCurrentPlayer(game)?.id === userId
      const leavingPlayer = game.players.splice(playerIndex, 1)[0]

      if (game.phase === "planting") {
        const hadSubmitted = (game.submittedIds || []).includes(userId)
        game.submittedIds = (game.submittedIds || []).filter(id => id !== userId)
        const mineId = game.mineOwners?.[userId]
        if (mineId !== undefined) {
          game.mines = game.mines.filter(id => id !== mineId)
        } else if (hadSubmitted) {
          game.mines = []
          game.submittedIds = []
          game.mineOwners = {}
          game.mineOwnerNames = {}
        }
        if (game.mineOwners) delete game.mineOwners[userId]
        if (game.mineOwnerNames) delete game.mineOwnerNames[userId]
      }

      if (game.players.length === 0) {
        await deleteGame(groupId, game)
        await e.reply(
          isQBotCompatible(e)
            ? [playerMention(e, leavingPlayer), markdownText(" 已退出，本局无人参加，游戏已取消")]
            : `${leavingPlayer.name} 已退出，本局无人参加，游戏已取消`,
        )
        return
      }

      const newHost = wasHost ? promoteRandomPlayer(game) : null
      const message = isQBotCompatible(e)
        ? [playerMention(e, leavingPlayer), markdownText(" 已退出本局")]
        : [`${leavingPlayer.name} 已退出本局`]
      if (newHost) {
        if (isQBotCompatible(e))
          message.push(markdownText("\n发起人已移交给 "), playerMention(e, newHost))
        else message.push(`\n发起人已移交给 ${newHost.name}`)
      }

      if (game.phase === "planting" && game.players.length < 2) {
        game.phase = "lobby"
        game.mines = []
        game.submittedIds = []
        game.mineOwners = {}
        game.mineOwnerNames = {}
        delete game.revealMineOwners
        delete game.totalChips
        await saveGame(groupId, game)
        message.push(
          isQBotCompatible(e)
            ? markdownText("\n当前不足 2 人，游戏已回到报名阶段")
            : "\n当前不足 2 人，游戏已回到报名阶段",
        )
        if (isQBotCompatible(e)) {
          await e.reply(markdownParts(message), false, { keyboard: this.makeLobbyKeyboard(game) })
        } else {
          await e.reply(message)
        }
        return
      }

      if (game.phase === "playing") {
        const survivors = game.players.filter(player => player.alive)
        if (survivors.length <= 1) {
          game.phase = "finished"
          const compatible = isQBotCompatible(e)
          const result = survivors.length
            ? compatible
              ? "本局结束"
              : `最后一名存活者 ${survivors[0].name} 获胜`
            : "所有存活玩家都已退出，本局无人获胜"
          const mineOwnerDetails = makeMineOwnerDetails(e, game)
          const mineListDetails = game.revealMineOwners
            ? []
            : [markdownText(`\n\n本局雷位 ${game.mines.join("、")}`)]
          if (compatible) {
            message.push(
              markdownText(`\n${result}`),
              ...makePlayerListQuote(e, survivors, "获胜玩家"),
              ...makeDeathSummary(e, game),
              ...makeMineOwnerSection(e, game, mineOwnerDetails),
              ...mineListDetails,
            )
          } else {
            message.push(
              "\n",
              result,
              ...makeDeathSummary(e, game),
              ...makeMineOwnerSection(e, game, mineOwnerDetails),
              ...(game.revealMineOwners ? [] : [`\n本局雷位 ${game.mines.join("、")}`]),
            )
          }
          await this.replyWithBoard(
            e,
            game,
            message,
            true,
            isQBotCompatible(e) ? { keyboard: this.makeRestartKeyboard(game) } : undefined,
          )
          await deleteGame(groupId, game)
          return
        }

        if (wasCurrentPlayer) {
          game.turnIndex = findNextAliveIndex(game, playerIndex - 1)
        } else if (playerIndex < game.turnIndex) {
          game.turnIndex--
        }
        if (game.turnIndex >= game.players.length) game.turnIndex = 0
      }

      const plantingComplete =
        game.phase === "planting" && game.submittedIds.length === game.players.length
      if (plantingComplete) {
        game.phase = "playing"
        delete game.submittedIds
        game.turnIndex = 0
      }

      await saveGame(groupId, game)
      if (game.phase === "planting") {
        message.push(
          isQBotCompatible(e)
            ? markdownText(`\n秘密布雷进度：**${game.submittedIds.length}/${game.players.length}**`)
            : `\n秘密布雷进度 ${game.submittedIds.length}/${game.players.length}`,
        )
      } else if (game.phase === "playing") {
        const currentPlayer = getCurrentPlayer(game)
        if (plantingComplete)
          message.push(
            isQBotCompatible(e)
              ? markdownText("\n**布雷完成，游戏开始**")
              : "\n布雷完成，游戏开始",
          )
        if (isQBotCompatible(e)) {
          message.push(...makeCurrentPlayerQuote(e, currentPlayer, "点击下方按钮选择薯片"))
        } else {
          message.push("\n现在轮到 ", playerMention(e, currentPlayer))
        }
      } else {
        message.push(
          isQBotCompatible(e)
            ? markdownText(
                `\n报名中：**${game.players.length}/${game.maxPlayers || DEFAULT_MAX_PLAYERS} 人**`,
              )
            : `\n报名中 ${game.players.length}/${game.maxPlayers || DEFAULT_MAX_PLAYERS} 人`,
        )
      }
      if (isQBotCompatible(e) && game.phase === "lobby") {
        await e.reply(markdownParts(message), false, { keyboard: this.makeLobbyKeyboard(game) })
      } else if (isQBotCompatible(e) && game.phase === "playing") {
        await this.replyWithBoard(e, game, message, false, {
          keyboards: this.makeGameKeyboards(game, "playing"),
        })
      } else {
        await e.reply(isQBotCompatible(e) ? markdownParts(message) : message)
      }
    })
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
      if (game.hostId !== getUserId(e) && !e.isMaster && !isGroupManager(e)) {
        await e.reply("只有发起人、群主、群管理员或 Bot 管理员可以结束本局")
        return
      }
      await deleteGame(groupId, game)
      await e.reply(
        isQBotCompatible(e)
          ? markdownText("## 本局游戏已结束\n\n棋盘和雷位已清除")
          : "本局薯片游戏已结束，棋盘和雷位已清除",
      )
    })
    return true
  }
}
