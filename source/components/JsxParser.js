import { Parser } from 'acorn-jsx'
import React, { Component } from 'react'
import parseStyle from '../helpers/parseStyle'
import { randomHash } from '../helpers/hash'

import ATTRIBUTES from '../constants/attributeNames'
import { canHaveChildren, canHaveWhitespace } from '../constants/specialTags'

const parserOptions = { plugins: { jsx: true } }

export default class JsxParser extends Component {
  static displayName = 'JsxParser'

  constructor(props) {
    super(props)
    this.handleNewProps(props)
  }

  componentWillReceiveProps(props) {
    this.handleNewProps(props)
  }

  handleNewProps = (props) => {
    this.blacklistedTags = (props.blacklistedTags || [])
      .map(tag => tag.trim().toLowerCase()).filter(Boolean)
    this.blacklistedAttrs = (props.blacklistedAttrs || [])
      .map(attr => (attr instanceof RegExp ? attr : new RegExp(attr, 'i')))

    const jsx = (props.jsx || '').trim()
      .replace(/<!DOCTYPE([^>]*)>/g, '')
      .replace(/(\r|\n)/g, '')
    this.ParsedChildren = this.parseJSX(jsx)
  }

  parseJSX = (rawJSX) => {
    const wrappedJsx = `<root>${rawJSX}</root>`
    let parsed = []
    try {
      parsed = (new Parser(parserOptions, wrappedJsx)).parse()
      parsed = parsed.body[0].expression.children || []
    } catch (error) {
      // eslint-disable-next-line no-console
      if (this.props.showWarnings) console.warn(error)
      if (this.props.onError) this.props.onError(error)
      return []
    }

    return parsed.map(this.parseExpression).filter(Boolean)
  }

  parseExpression = (expression) => {
    /* eslint-disable no-case-declarations */
    switch (expression.type) {
      case 'JSXElement':
        return this.parseElement(expression)
      case 'JSXText':
        return (expression.value || '')
      case 'JSXAttribute':
        if (expression.value === null) return true
        return this.parseExpression(expression.value)

      case 'ArrayExpression':
        return expression.elements.map(this.parseExpression)
      case 'ObjectExpression':
        const object = {}
        expression.properties.forEach((prop) => {
          object[prop.key.name || prop.key.value] = this.parseExpression(prop.value)
        })
        return object
      case 'JSXExpressionContainer':
        return this.parseExpression(expression.expression)
      case 'Literal':
        return expression.value

      default:
        return undefined
    }
  }

  parseElement = (element) => {
    const { bindings = {}, components = {}, stripWhitespace = false } = this.props
    const { children = [], openingElement } = element
    const { attributes = [], name: { name } = {} } = openingElement

    if (/^(html|head|body)$/i.test(name)) return children.map(c => this.parseElement(c))

    if (this.blacklistedTags.indexOf(name.trim().toLowerCase()) !== -1) return undefined
    let parsedChildren
    if (components[name] || canHaveChildren(name)) {
      parsedChildren = children.map(this.parseExpression)
      if (!components[name] && (!canHaveWhitespace(name) || stripWhitespace)) {
        parsedChildren = parsedChildren.filter(child => (
          typeof child !== 'string' || !/^\s*$/.test(child)
        ))
      }

      if (parsedChildren.length === 0) {
        parsedChildren = undefined
      } else if (parsedChildren.length === 1) {
        [parsedChildren] = parsedChildren
      }
    }

    const attrs = { key: randomHash(), ...bindings }
    attributes.forEach((expr) => {
      const rawName = expr.name.name
      const attributeName = ATTRIBUTES[rawName] || rawName
      // if the value is null, this is an implicitly "true" prop, such as readOnly
      const value = this.parseExpression(expr)

      const matches = this.blacklistedAttrs.filter(re => re.test(attributeName))
      if (matches.length === 0) attrs[attributeName] = value
    })

    if (typeof attrs.style === 'string') {
      attrs.style = parseStyle(attrs.style)
    }

    return React.createElement(components[name] || name, attrs, parsedChildren)
  }

  render = () => (
    this.props.renderInWrapper
      ? <div className="jsx-parser">{this.ParsedChildren}</div>
      : this.ParsedChildren
  )
}

JsxParser.defaultProps = {
  bindings:         {},
  blacklistedAttrs: [/^on.+/i],
  blacklistedTags:  ['script'],
  components:       [],
  jsx:              '',
  onError:          () => { },
  showWarnings:     false,
  renderInWrapper:  true,
  stripWhitespace: false,
}

if (process.env.NODE_ENV !== 'production') {
  /* eslint-disable react/no-unused-prop-types */
  // eslint-disable-next-line global-require,import/no-extraneous-dependencies
  const PropTypes = require('prop-types')
  JsxParser.propTypes = {
    bindings:         PropTypes.shape({}),
    blacklistedAttrs: PropTypes.arrayOf(PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.instanceOf(RegExp),
    ])),
    blacklistedTags: PropTypes.arrayOf(PropTypes.string),
    components:      PropTypes.shape({}),
    jsx:             PropTypes.string,
    onError:         PropTypes.func,
    showWarnings:    PropTypes.bool,
    renderInWrapper: PropTypes.bool,
    stripWhitespace: PropTypes.bool,
  }
}
