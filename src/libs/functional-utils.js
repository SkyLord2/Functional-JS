/*
* @author chengdongsheng <chengdongsheng@outlook.com>
*/
export function partial(fn, ...partialArgs) {
    const args = partialArgs;
    return function (...fullArguments) {
        let arg = 0;
        for (let i = 0; i < args.length && arg < fullArguments.length; i++) {
            const element = args[i];
            if (element === undefined) {
                args[i] = fullArguments[arg++];
            }
        }
        while (arg < fullArguments.length) {
            args.push(fullArguments[arg++]);
        }
        return fn.apply(null, args);
    }
}

export function curry(func) {
    return function curried(...args) {
        if (args.length >= func.length) {
            return func.apply(this, args);
        } else {
            return function (...args2) {
                return curried.apply(this, args.concat(args2));
            }
        }
    }
}

export const compose = (...args) => 
    value => 
        args.reverse().reduce(
            (acc, fn) => fn(acc), 
            value
        )

export const pipe = (...args) =>
    value => 
        args.reduce(
            (acc, fn) => fn(acc),
            value
        )

export const identity = _ => _;

export const tap = fn =>
        value => (
            typeof fn === 'function' && fn(value),
            value
        )

export const alt = (fn1, fn2) => 
        value => fn1(value) || fn2(value)

export const and = (fn1, fn2) => 
        value => fn1(value) && fn2(value)

export const then = (pred, fn) => 
        value => (typeof pred === 'function' ? pred(value) : !!pred) ? fn(value) : value

export const ifElse = (condition, fn1, fn2) =>
        value => (typeof condition === 'function' ? condition(value) : !!condition) ? fn1(value) : fn2(value)

export const cond = (...args) =>
        value => { 
            for (const [condition, action] of args) {
                if (condition(value)) {
                    return action(value);
                }
            }
            return value;
        }

export const when = (pred, fn) =>
        function trans(value) {
            if (!pred(value)) {
                return value;
            }
            return trans(fn(value));
        }

export const seq = (...fns) =>
        value => fns.forEach(fn => fn(value))

export const fork = (join, fn1, fn2) => 
        value => join(fn1(value), fn2(value))

export const functionalize = (fn, ...arg) => () => fn(...arg)

//* MayBe函子
class MayBe {
    constructor(value) {
        this.value = value;
    }
    static of(value) {
        return new MayBe(value);
    }
}
MayBe.prototype.isNothing = function () {
    return this.value === null || this.value === undefined;
}
MayBe.prototype.join = function () {
    return this.isNothing() ? MayBe.of(null) : this.value;
}
MayBe.prototype.unwrap = function () {
    if(!(this.value instanceof MayBe)) {
        return this;
    }
    return this.value.unwrap();
}
MayBe.prototype.map = function (fn) {
    return this.isNothing() ? MayBe.of(null) : MayBe.of(fn(this.value));
}
//* Left函子
class Left {
    constructor(value) {
        this.value = value;
    }
    static of(value) {
        return new Left(value);
    }
}
Left.prototype.map = function (/*fn*/) {
    return this;
}
Left.prototype.toString = function () {
    return `Left(${this.value})`;
}
//* Right函子
class Right {
    constructor(value) {
        this.value = value;
    }
    static of(value) {
        return new Right(value);
    }
}
Right.prototype.map = function (fn) {
    return Right.of(fn(this.value));
}
Right.prototype.unwrap = function () {
    if(!(this.value instanceof Right)) {
        //* 返回原始的值
        return this.value;
    }
    return this.value.unwrap();
}
Right.prototype.toString = function () {
    return `Right(${this.value})`;
}

//* Either函子实现FP中的错误传递问题
export class Either {
    static of(value) {
        return value ? Right.of(value) : Left.of(value);
    }
}
/*
! fork 是一个形如 (reject, resolve) => { condition ? resolve() : reject() } 的分支函数
*/
export const Task = fork => ({
    map: f => Task((reject, resolve) =>                     //* 返回一个包含fork的新Task, 用于链式调用处理前一个Task的结果
            fork(reject, x => resolve(f(x)))),              //* 在调用时, 会先调用前一个Task的fork, 然后再使用其结果为参数调用f, 最后再resolve中返回f的结果

    chain: f => Task((reject, resolve) =>                   //* 返回一个新的Task, 以前一个Task的结果作为下一个Task参数
            fork(reject, x => f(x).fork(reject, resolve))), //* f函数返回一个以x为参数的新Task

    apend: other => Task((reject, resolve) => 
            fork(reject, f => other.fork(reject, x => resolve(f(x))))),
    
    concat: other => Task((reject, resolve) => 
            fork(reject, x => other.fork(reject, y => {
                // console.log('X=',x, 'Y=', y)
                x = Array.isArray(x) ? x : [x];
                resolve(x.concat(y))
            }))
        ),
    
    concat_: other => Task((reject, resolve) => 
            fork(reject, x => other.fork(reject, y => {
                // console.log('X',x, 'Y', y)
                resolve(x.concat(y))
            }))
        ),

    fold: (f, g) => Task((reject, resolve) => 
            fork(x => f(x).fork(reject, resolve), x => g(x).fork(reject, resolve))),

    fork
})
Task.of = x => Task((reject, resolve) => resolve(x))
Task.rejected = x => Task((reject, resolve) => reject(x))
Task.fromPromised = fn => (...args) => Task((reject, resolve) => fn(...args).then(resolve).catch(reject))
/*
eg:
```javascript
function testTaskFunctor() {
    const test = test1()
    .map((data) => 
        (console.log('test1: ', data), data)
    )
    .chain((data) => 
        test2(data)
    )
    .map((data) => 
        (console.log('test2: ', data), data)
    )
    .chain((data) => 
        test3(data)
    )
    test.fork((error) => {
        console.log('test error: ', error);
    }, (data) => {
        console.log('test result: ', data);
    })
}

const test1 = () => Task(
    (reject, resolve) => 
        new Promise((resolve, reject) => {
            let timer = setTimeout(() => {
                resolve(1);
                clearTimeout(timer);
            }, 1000);
        }).
        then((data) => resolve(data))
    )
const test2 = (prev) => Task(
    (reject, resolve) =>
        new Promise((resolve, reject) => {
            let timer = setTimeout(() => {
                console.log('previous task:', prev);
                resolve(2);
                clearTimeout(timer);
            }, 1000);
        }).
        then((data) => resolve(data))
)
const test3 = (prev) => Task(
    (reject, resolve) => 
        new Promise((resolve, reject) => {
            let timer = setTimeout(() => {
                console.log('previous task:', prev);
                resolve(3);
                clearTimeout(timer);
            }, 1000);
        }).
        then((data) => resolve(data))
)
```
*/

export function fnLog(message, ...optionalParams) {
    const full = [message || ''].concat(optionalParams);
    return functionalize(console.log, ...full || '');
}

export function fnError(message, ...optionalParams) {
    const full = [message || ''].concat(optionalParams);
    return functionalize(console.error, ...full || '');
}