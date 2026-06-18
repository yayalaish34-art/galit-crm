import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LeadsModule } from './leads/leads.module';
import { UsersModule } from './users/users.module';
import { CustomersModule } from './customers/customers.module';
import { TasksModule } from './tasks/tasks.module';
import { QuotesModule } from './quotes/quotes.module';
import { ReportsModule } from './reports/reports.module';
import { ProjectsModule } from './projects/projects.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { DocumentsModule } from './documents/documents.module';
import { LabSamplesModule } from './lab-samples/lab-samples.module';
import { SearchModule } from './search/search.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SettingsModule } from './settings/settings.module';
import { QuoteItemCatalogModule } from './quote-item-catalog/quote-item-catalog.module';
import { QuoteTemplatesModule } from './quote-templates/quote-templates.module';
import { CustomerClassificationsModule } from './customer-classifications/customer-classifications.module';
import { FollowupImportModule } from './followup-import/followup-import.module';
import { AuthModule } from './auth/auth.module';
import { PaymentTermsModule } from './payment-terms/payment-terms.module';
import { DevAgentModule } from './dev-agent/dev-agent.module';
import { PublicModule } from './public/public.module';
import { MicrosoftModule } from './microsoft/microsoft.module';
import { AiMailModule } from './ai-mail/ai-mail.module';

@Module({
  imports: [AuthModule, LeadsModule, UsersModule, CustomersModule, CustomerClassificationsModule, TasksModule, QuotesModule, ReportsModule, ProjectsModule, OpportunitiesModule, DocumentsModule, LabSamplesModule, SearchModule, DashboardModule, SettingsModule, QuoteItemCatalogModule, QuoteTemplatesModule, FollowupImportModule, PaymentTermsModule, DevAgentModule, PublicModule, MicrosoftModule, AiMailModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
