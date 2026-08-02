openapi: 3.1.0
info:
  # Do not change the title, if the title changes, the import paths will be broken
  title: Api
  version: 0.1.0
  description: OneOffice AI API specification
servers:
  - url: /api
    description: Base API path
tags:
  - name: health
    description: Health operations
  - name: auth
    description: User onboarding and authentication
  - name: posts
    description: Post management
  - name: products
    description: Inventory product management
paths:
  /healthz:
    get:
      operationId: healthCheck
      tags: [health]
      summary: Health check
      description: Returns server health status
      responses:
        "200":
          description: Healthy
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/HealthStatus"

  /connect:
    post:
      operationId: connectUser
      tags: [auth]
      summary: Connect user with Telegram bot
      description: Verify bot token via Telegram, store user info and channel connection
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ConnectInput"
      responses:
        "200":
          description: Successfully connected
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ConnectResult"
        "400":
          description: Invalid input or bot token
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /publish:
    post:
      operationId: publishPost
      tags: [posts]
      summary: Publish a post to Telegram channel
      description: Sends a post to the user's connected Telegram channel using the stored bot token
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/PublishInput"
      responses:
        "200":
          description: Successfully published
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/PublishResult"
        "400":
          description: Invalid input or publish error
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
        "404":
          description: User not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /enrich:
    post:
      operationId: enrichProduct
      tags: [posts]
      summary: AI-enrich a product and find images
      description: Uses AI to generate premium post text, specs, market price analysis, lifehacks, and finds real product images
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/EnrichInput"
      responses:
        "200":
          description: Enriched product data
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/EnrichResult"
        "400":
          description: Invalid input
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /images:
    get:
      operationId: searchImages
      tags: [posts]
      summary: Search product images
      parameters:
        - name: q
          in: query
          required: true
          schema:
            type: string
        - name: count
          in: query
          required: false
          schema:
            type: integer
      responses:
        "200":
          description: Image search results
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ImageSearchResult"

  /products:
    get:
      operationId: listProducts
      tags: [products]
      summary: List the signed-in user's inventory products
      parameters:
        - name: status
          in: query
          required: false
          description: Filter by draft or active. Omit to return all.
          schema:
            $ref: "#/components/schemas/ProductStatus"
      responses:
        "200":
          description: List of products
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/ProductItem"
        "401":
          description: Not signed in
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
    post:
      operationId: createProduct
      tags: [products]
      summary: Create a new inventory product (or draft)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateProductInput"
      responses:
        "200":
          description: Created product
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ProductItem"
        "400":
          description: Invalid input
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
        "401":
          description: Not signed in
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /products/{id}:
    patch:
      operationId: updateProduct
      tags: [products]
      summary: Edit or update the status (e.g. publish a draft) of a product
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/UpdateProductInput"
      responses:
        "200":
          description: Updated product
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ProductItem"
        "400":
          description: Invalid input
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
        "401":
          description: Not signed in
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
        "404":
          description: Product not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
    delete:
      operationId: deleteProduct
      tags: [products]
      summary: Delete a product
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      responses:
        "200":
          description: Deleted
          content:
            application/json:
              schema:
                type: object
                required: [success]
                properties:
                  success:
                    type: boolean
        "401":
          description: Not signed in
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
        "404":
          description: Product not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

components:
  schemas:
    HealthStatus:
      type: object
      properties:
        status:
          type: string
      required:
        - status

    ConnectInput:
      type: object
      required:
        - firstName
        - lastName
        - telegramUsername
        - company
        - channelUsername
        - botToken
      properties:
        firstName:
          type: string
        lastName:
          type: string
        telegramUsername:
          type: string
        company:
          type: string
        channelUsername:
          type: string
        botToken:
          type: string

    ConnectResult:
      type: object
      required:
        - id
        - channelId
        - botUsername
      properties:
        id:
          type: integer
        channelId:
          type: string
        botUsername:
          type: string

    PublishInput:
      type: object
      required:
        - userId
        - text
      properties:
        userId:
          type: integer
        text:
          type: string
        imageUrl:
          type: ["string", "null"]

    PublishResult:
      type: object
      required:
        - success
        - messageId
      properties:
        success:
          type: boolean
        messageId:
          type: integer

    EnrichInput:
      type: object
      required:
        - name
        - price
        - category
      properties:
        name:
          type: string
        price:
          type: string
        category:
          type: string
        notes:
          type: string

    EnrichedSpecs:
      type: object
      properties:
        marketPrice:
          type: string
        priceDiff:
          type: string
        priceDiffPercent:
          type: number
        description:
          type: string
        usageGuide:
          type: string
        dimensions:
          type: string
        weight:
          type: string
        extras:
          type: string
        lifehacks:
          type: string

    ProductImage:
      type: object
      required:
        - url
        - thumbnail
        - title
      properties:
        url:
          type: string
        thumbnail:
          type: string
        title:
          type: string
        source:
          type: string

    EnrichResult:
      type: object
      required:
        - postText
        - images
        - enriched
      properties:
        postText:
          type: string
        images:
          type: array
          items:
            $ref: "#/components/schemas/ProductImage"
        enriched:
          $ref: "#/components/schemas/EnrichedSpecs"

    ImageSearchResult:
      type: object
      required:
        - images
      properties:
        images:
          type: array
          items:
            $ref: "#/components/schemas/ProductImage"

    ErrorResponse:
      type: object
      required:
        - error
      properties:
        error:
          type: string

    ProductStatus:
      type: string
      enum: [draft, active]

    ProductItem:
      type: object
      required:
        - id
        - name
        - category
        - costPrice
        - sellPrice
        - description
        - images
        - status
        - createdAt
      properties:
        id:
          type: integer
        name:
          type: string
        category:
          type: string
        costPrice:
          type: string
        sellPrice:
          type: string
        description:
          type: string
        images:
          type: array
          items:
            type: string
        status:
          $ref: "#/components/schemas/ProductStatus"
        createdAt:
          type: string

    CreateProductInput:
      type: object
      properties:
        name:
          type: string
        category:
          type: string
        costPrice:
          type: string
        sellPrice:
          type: string
        description:
          type: string
        images:
          type: array
          items:
            type: string
        status:
          $ref: "#/components/schemas/ProductStatus"

    UpdateProductInput:
      type: object
      properties:
        name:
          type: string
        category:
          type: string
        costPrice:
          type: string
        sellPrice:
          type: string
        description:
          type: string
        images:
          type: array
          items:
            type: string
        status:
          $ref: "#/components/schemas/ProductStatus"
