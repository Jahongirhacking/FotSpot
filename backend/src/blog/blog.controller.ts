import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BlogService } from './blog.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { OptionalUser } from '../common/decorators/optional-user.decorator';
import {
  AdminListPostsDto,
  BlogImageUploadDto,
  ListPostsDto,
  SaveCategoryDto,
  SavePostDto,
} from './dto/blog.dto';

@ApiTags('blog')
@ApiBearerAuth('bearer')
@Controller('blog')
export class BlogController {
  constructor(private blog: BlogService) {}

  // ---------- Public ----------

  /** The listing page in one request: featured, latest, this week, top, categories. */
  @Public()
  @Get('home')
  home() {
    return this.blog.home();
  }

  /** One page of published posts — by category, by search, newest or most liked. */
  @Public()
  @Get('posts')
  list(@Query() dto: ListPostsDto) {
    return this.blog.list(dto);
  }

  /** The categories, each with how many published posts it holds. */
  @Public()
  @Get('categories')
  categories() {
    return this.blog.categoriesWithCounts();
  }

  /** Every published post's address and dates, for the sitemap. Drafts never appear. */
  @Public()
  @Get('sitemap')
  sitemap() {
    return this.blog.sitemapEntries();
  }

  /** A published post, rendered, with related posts. A guest reads the same page. */
  @Public()
  @Get('posts/:slug')
  bySlug(@Param('slug') slug: string, @OptionalUser() viewerUserId?: string) {
    return this.blog.bySlug(slug, viewerUserId);
  }

  /** Like a post — one per person; a second press changes nothing. */
  @Post('posts/:slug/like')
  like(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.blog.setLike(slug, user.userId, true);
  }

  @Delete('posts/:slug/like')
  unlike(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.blog.setLike(slug, user.userId, false);
  }

  // ---------- Admin ----------

  @Roles('admin', 'super_admin')
  @Get('admin/posts')
  adminList(@Query() dto: AdminListPostsDto) {
    return this.blog.adminList(dto);
  }

  @Roles('admin', 'super_admin')
  @Get('admin/posts/:id')
  adminGet(@Param('id') id: string) {
    return this.blog.adminGet(id);
  }

  /** Creates a draft. The slug is made from the title unless one is sent. */
  @Roles('admin', 'super_admin')
  @Post('admin/posts')
  create(@CurrentUser() user: AuthUser, @Body() dto: SavePostDto) {
    return this.blog.create(user.userId, dto);
  }

  /** Edits any field. A title change never rewrites the slug; send one to change it. */
  @Roles('admin', 'super_admin')
  @Patch('admin/posts/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SavePostDto) {
    return this.blog.update(user.userId, id, dto);
  }

  @Roles('admin', 'super_admin')
  @Post('admin/posts/:id/publish')
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.blog.publish(user.userId, id);
  }

  @Roles('admin', 'super_admin')
  @Post('admin/posts/:id/unpublish')
  unpublish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.blog.unpublish(user.userId, id);
  }

  @Roles('admin', 'super_admin')
  @Delete('admin/posts/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.blog.remove(user.userId, id);
  }

  /** A presigned PUT for the post's cover or share image, under `public/blog/<post>/`. */
  @Roles('admin', 'super_admin')
  @Post('admin/posts/:id/images/upload-url')
  imageUploadUrl(@Param('id') id: string, @Body() dto: BlogImageUploadDto) {
    return this.blog.imageUploadUrl(id, dto);
  }

  @Roles('admin', 'super_admin')
  @Post('admin/categories')
  createCategory(@Body() dto: SaveCategoryDto) {
    return this.blog.createCategory(dto);
  }

  @Roles('admin', 'super_admin')
  @Patch('admin/categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: SaveCategoryDto) {
    return this.blog.updateCategory(id, dto);
  }

  @Roles('admin', 'super_admin')
  @Delete('admin/categories/:id')
  removeCategory(@Param('id') id: string) {
    return this.blog.removeCategory(id);
  }
}
