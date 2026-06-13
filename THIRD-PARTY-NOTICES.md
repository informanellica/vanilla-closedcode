# Third-Party Notices

This project contains first-party source files that are reimplementations,
ports, or derivative works of the open-source libraries listed below. Each of
these libraries is distributed under the MIT License. In accordance with the MIT
License, the original copyright notices and the full license text are reproduced
here. Where a first-party file is a port or derivative of one of these
libraries, its header comment names the upstream library and points to this
file.

The reproduction of these notices does not imply that the listed upstream
authors endorse this project.

---

## Solid (solid-js, @solidjs/router, @solidjs/meta) and dom-expressions

This project includes:

- An API-compatible reimplementation of the subset of **solid-js** used by the
  app (`src/packages/app/src/lib/reactivity.js`). Its reactive core
  (signals/effects/memos/owners) is an independent implementation; the
  `memo` / `template` DOM helpers reproduce the **dom-expressions**
  (`solid-js/web`) runtime helpers of the same name.
- A faithful port of **solid-js/store**
  (`src/packages/app/src/lib/store.js`).
- A port of the subset of **@solidjs/router** used by the app
  (`src/packages/app/src/lib/router/index.js`).
  Homepage: https://github.com/solidjs/solid-router
- A pass-through stand-in for **@solidjs/meta**'s `MetaProvider`
  (`src/packages/app/src/lib/primitives/meta.js`).
  Homepage: https://github.com/solidjs/solid-meta

Homepages: https://www.solidjs.com — https://github.com/solidjs/solid —
https://github.com/ryansolid/dom-expressions

```
MIT License

Copyright (c) 2016-2025 Ryan Carniato

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

> Note: `@solidjs/router` is published under the same MIT License with the
> copyright line `Copyright (c) 2020-2022 Ryan Carniato`. `@solidjs/meta` is
> published under the MIT License authored by Ryan Carniato.

---

## @tanstack/solid-query and @tanstack/query-core

This project includes a reimplementation of the subset of **@tanstack/solid-query**
and its **@tanstack/query-core** dependency used by the app
(`src/packages/app/src/lib/query/index.js`).

Homepage: https://tanstack.com/query

```
MIT License

Copyright (c) 2021-present Tanner Linsley

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## @thisbeyond/solid-dnd

This project includes a reimplementation of the subset of **@thisbeyond/solid-dnd**
(pointer-driven sortable drag-and-drop) used by the app
(`src/packages/app/src/lib/dnd/index.js`).

Homepage: https://github.com/thisbeyond/solid-dnd

```
MIT License

Copyright (c) 2021 Martin Pengelly-Phillips

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## Solid Primitives (@solid-primitives/event-listener, /resize-observer, /media, /event-bus, /timer, /i18n)

This project includes reimplementations of the subsets of the following
**@solid-primitives** packages used by the app, under
`src/packages/app/src/lib/primitives/`:

- **@solid-primitives/event-listener** (`event-listener.js`)
- **@solid-primitives/resize-observer** (`resize-observer.js`)
- **@solid-primitives/media** (`media.js`)
- **@solid-primitives/event-bus** (`event-bus.js`)
- **@solid-primitives/timer** (`timer.js`)
- **@solid-primitives/i18n** (`i18n.js`)

Homepage: https://github.com/solidjs-community/solid-primitives

```
MIT License

Copyright (c) 2021 Solid Primitives Working Group

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## @solid-primitives/storage

This project includes a reimplementation of the subset of
**@solid-primitives/storage** (`makePersisted`) used by the app
(`src/packages/app/src/lib/primitives/storage.js`).

Homepage: https://github.com/solidjs-community/solid-primitives

```
MIT License

Copyright (c) 2021 Solid Core Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## solid-list and @corvu/utils

This project includes a reimplementation of the subset of **solid-list**
(`createList`) used by the app
(`src/packages/app/src/lib/primitives/solid-list.js`), which also inlines two
small helpers from **@corvu/utils** (`access` and `createControllableSignal`).

Homepages: https://corvu.dev/docs/utilities/list — https://corvu.dev

```
MIT License

Copyright (c) 2023-2024 Jasmin Noetzli

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## @kobalte/core

This project includes vanilla reimplementations of the behaviors of several
**@kobalte/core** components, under
`src/packages/app/src/vendor/ui/components/` (accordion, collapsible,
context-menu, dialog, dropdown-menu, floating, hover-card, image-preview,
popover, radio-group, select, switch, tabs, text-field, toast, tooltip) and
`src/packages/app/src/components/dialog-select-model.js` (built on the
kobalte-derived popover).

Homepage: https://kobalte.dev

```
MIT License

Copyright (c) 2024 jer3m01 <jer3m01@jer3m01.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
