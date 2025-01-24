## 钓鱼特殊事件
### 介绍
这是一个为有一定JavaScript编写基础的用户提供的自定义特殊事件的方法
### 函数 probability
该函数应返回一个数组，内包含需要触发的函数名、触发概率。触发概率的总和为100
```JavaScript
// 示例
return [
    {
        name: '空军', // 触发的函数名
        probability: 70 // 触发概率
    },{
        name: '鲨鱼',
        probability: 30
    }
]
```
### 全局函数 timerManager
#### 函数 createTimer
为某用户创建钓鱼CD
```JavaScript
const timeSet = timerManager.createTimer(e.user_id, fishcd) //e.user_id 为用户ID，fishcd为钓鱼CD（单位秒）
timeSet.start()
```
#### 函数 getRemainingTime
获取某用户钓鱼CD剩余时间
```JavaScript
console.log(timerManager.getRemainingTime(e.user_id)) //e.user_id 后+101为捕鱼网剩余时间（字符串拼接101）
```
*好久没写钓鱼小游戏了，很多东西的作用我已经忘了，需要的可以自己去扒一下代码*